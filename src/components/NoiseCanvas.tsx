import { useEffect, useRef } from 'react';
import { hashSeed } from '../generation/random';

export type NoiseSettings = {
  seed: string;
  size: number;
  complexity: number;
  contrast: number;
  brightness: number;
  showMap: boolean;
  nodeDensity: number;
  connectionDensity: number;
  angleBias: number;
  organicity: number;
  nodeSize: number;
  lineWidth: number;
  backgroundColor: string;
  lineColor: string;
  nodeColor: string;
  pathEnabled: boolean;
  pathThickness: number;
  pathEndpointSpread: number;
  pathColor: string;
  motionEnabled: boolean;
  loopDuration: number;
  motionAmount: number;
  frameRate: number;
  transparentBackground: boolean;
  videoExportNonce: number;
  width: number;
  height: number;
};

type PoolNode = {
  id: number;
  x: number;
  y: number;
  gate: number;
  baseWeight: number;
  morphWeights: [number, number, number, number];
  stubBaseWeight: number;
  stubMorphWeights: [number, number, number, number];
  stubGate: number;
  stubAngle: number;
  stubLength: number;
};

type PoolEdge = {
  id: number;
  a: PoolNode;
  b: PoolNode;
  gate: number;
  angle: number;
  baseWeight: number;
  morphWeights: [number, number, number, number];
};

type PatternPool = {
  nodes: PoolNode[];
  edges: PoolEdge[];
  pathEdges: Set<number>;
};

type GlBundle = {
  gl: WebGLRenderingContext;
  line: WebGLProgram;
  point: WebGLProgram;
  texture: WebGLProgram;
  linePosition: number;
  lineAlpha: number;
  lineResolution: WebGLUniformLocation;
  lineColor: WebGLUniformLocation;
  pointPosition: number;
  pointAlpha: number;
  pointResolution: WebGLUniformLocation;
  pointColor: WebGLUniformLocation;
  pointSize: WebGLUniformLocation;
  texturePosition: number;
  textureUv: number;
  textureSampler: WebGLUniformLocation;
  textureAlpha: WebGLUniformLocation;
};

function smoothstep(t: number) {
  return t * t * (3 - 2 * t);
}

function lattice(seed: number, x: number, y: number) {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(seed: number, x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = smoothstep(xf);
  const v = smoothstep(yf);
  const a = lattice(seed, xi, yi);
  const b = lattice(seed, xi + 1, yi);
  const c = lattice(seed, xi, yi + 1);
  const d = lattice(seed, xi + 1, yi + 1);
  const x1 = a + (b - a) * u;
  const x2 = c + (d - c) * u;
  return x1 + (x2 - x1) * v;
}

function rng(seed: number) {
  let state = seed || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgba(hex: string, alpha: number) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((part) => part + part).join('') : clean;
  const value = Number.parseInt(full.slice(0, 6), 16);
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
    alpha,
  ] as const;
}

function sampleNoiseField(seed: number, x: number, y: number, settings: NoiseSettings) {
  const baseScale = 1 / (110 + settings.size * 760);
  const octaveCount = Math.round(2 + settings.complexity * 5);
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let total = 0;

  for (let octave = 0; octave < octaveCount; octave += 1) {
    sum += valueNoise(seed + octave * 1013, x * baseScale * frequency, y * baseScale * frequency) * amplitude;
    total += amplitude;
    frequency *= 1.75 + settings.complexity * 0.62;
    amplitude *= 0.55;
  }

  const normalized = sum / total;
  const contrasted = Math.max(0, Math.min(1, (normalized - 0.5) * (1 + settings.contrast * 3.2) + 0.5));
  return Math.max(0, Math.min(1, contrasted * (0.52 + settings.brightness)));
}

function sampleNoise(seed: number, x: number, y: number, settings: NoiseSettings, phase = 0) {
  if (!settings.motionEnabled || settings.motionAmount <= 0.001) return sampleNoiseField(seed, x, y, settings);
  const seedStep = 8191;
  const segmentCount = 4;
  const position = ((phase % 1) + 1) % 1 * segmentCount;
  const segment = Math.floor(position);
  const blend = smoothstep(position - segment);
  const base = sampleNoiseField(seed, x, y, settings);
  const a = sampleNoiseField(seed + segment * seedStep, x, y, settings);
  const b = sampleNoiseField(seed + ((segment + 1) % segmentCount) * seedStep, x, y, settings);
  const morphed = a + (b - a) * blend;
  return base + (morphed - base) * settings.motionAmount;
}

function buildMorphWeights(seed: number, x: number, y: number, settings: NoiseSettings) {
  const seedStep = 8191;
  return [
    sampleNoiseField(seed, x, y, settings),
    sampleNoiseField(seed + seedStep, x, y, settings),
    sampleNoiseField(seed + seedStep * 2, x, y, settings),
    sampleNoiseField(seed + seedStep * 3, x, y, settings),
  ] as [number, number, number, number];
}

function morphValue(base: number, weights: [number, number, number, number], settings: NoiseSettings, phase: number) {
  if (!settings.motionEnabled || settings.motionAmount <= 0.001) return base;
  const position = ((phase % 1) + 1) % 1 * weights.length;
  const segment = Math.floor(position);
  const blend = smoothstep(position - segment);
  const a = weights[segment];
  const b = weights[(segment + 1) % weights.length];
  const morphed = a + (b - a) * blend;
  return base + (morphed - base) * settings.motionAmount;
}

function angleScore(a: PoolNode, b: PoolNode) {
  const angle = Math.abs(Math.atan2(b.y - a.y, b.x - a.x));
  const step = Math.PI / 4;
  const snapped = Math.round(angle / step) * step;
  const delta = Math.abs(angle - snapped);
  return 1 - Math.min(1, delta / (Math.PI / 8));
}

function directionBucket(a: PoolNode, b: PoolNode) {
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const full = Math.PI * 2;
  return ((Math.round(((angle + full) % full) / (Math.PI / 4)) % 8) + 8) % 8;
}

function keyFor(x: number, y: number, cell: number) {
  return `${Math.floor(x / cell)}:${Math.floor(y / cell)}`;
}

function buildPatternPool(settings: NoiseSettings): PatternPool {
  const seed = hashSeed(settings.seed);
  const random = rng(seed + 17);
  const nodes: PoolNode[] = [];
  const spacing = 18 - settings.nodeDensity * 9;
  const jitter = spacing * (0.16 + settings.organicity * 0.26 - settings.angleBias * 0.06);
  const cell = spacing * 2.4;
  const buckets = new Map<string, number[]>();

  for (let y = spacing * 0.5; y < settings.height; y += spacing) {
    for (let x = spacing * 0.5; x < settings.width; x += spacing) {
      if (random() > 0.55 + settings.nodeDensity * 0.42) continue;
      const px = x + (random() - 0.5) * jitter;
      const py = y + (random() - 0.5) * jitter;
      const stubAngle = Math.round((random() * Math.PI * 2) / (Math.PI / 4)) * (Math.PI / 4);
      const stubLength = spacing * (0.55 + random() * (0.65 + settings.organicity * 0.6));
      const stubX = px + Math.cos(stubAngle) * stubLength;
      const stubY = py + Math.sin(stubAngle) * stubLength;
      const node = {
        id: nodes.length,
        x: px,
        y: py,
        gate: random(),
        baseWeight: sampleNoiseField(seed, px, py, settings),
        morphWeights: buildMorphWeights(seed, px, py, settings),
        stubBaseWeight: sampleNoiseField(seed, stubX, stubY, settings),
        stubMorphWeights: buildMorphWeights(seed, stubX, stubY, settings),
        stubGate: random(),
        stubAngle,
        stubLength,
      };
      nodes.push(node);
      const key = keyFor(node.x, node.y, cell);
      buckets.set(key, [...(buckets.get(key) ?? []), node.id]);
    }
  }

  const nearby = (node: PoolNode, radius: number) => {
    const minX = Math.floor((node.x - radius) / cell);
    const maxX = Math.floor((node.x + radius) / cell);
    const minY = Math.floor((node.y - radius) / cell);
    const maxY = Math.floor((node.y + radius) / cell);
    const found: PoolNode[] = [];
    for (let bx = minX; bx <= maxX; bx += 1) {
      for (let by = minY; by <= maxY; by += 1) {
        for (const id of buckets.get(`${bx}:${by}`) ?? []) {
          if (id !== node.id) found.push(nodes[id]);
        }
      }
    }
    return found;
  };

  const edges: PoolEdge[] = [];
  const used = new Set<string>();
  const radius = spacing * (1.65 + settings.connectionDensity * 1.35);
  const maxEdges = Math.round(1 + settings.connectionDensity * 3);

  for (const node of nodes) {
    const byDirection = new Map<number, { other: PoolNode; angle: number; score: number }>();
    for (const other of nearby(node, radius)) {
      const d = Math.hypot(other.x - node.x, other.y - node.y);
      const angle = angleScore(node, other);
      if (d <= spacing * 0.72 || d >= radius || angle < 0.58 + settings.angleBias * 0.22) continue;
      const bucket = directionBucket(node, other);
      const score = angle * settings.angleBias - d / radius + (bucket % 2 === 0 ? 0.14 : 0);
      const previous = byDirection.get(bucket);
      if (!previous || score > previous.score) byDirection.set(bucket, { other, angle, score });
    }

    const candidates = Array.from(byDirection.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, maxEdges);

    for (const candidate of candidates) {
      const key = node.id < candidate.other.id ? `${node.id}-${candidate.other.id}` : `${candidate.other.id}-${node.id}`;
      if (used.has(key)) continue;
      used.add(key);
      edges.push({
        id: edges.length,
        a: node,
        b: candidate.other,
        gate: random(),
        angle: candidate.angle,
        baseWeight: sampleNoiseField(seed, (node.x + candidate.other.x) * 0.5, (node.y + candidate.other.y) * 0.5, settings),
        morphWeights: buildMorphWeights(seed, (node.x + candidate.other.x) * 0.5, (node.y + candidate.other.y) * 0.5, settings),
      });
    }
  }

  return {
    nodes,
    edges,
    pathEdges: settings.pathEnabled ? findPoolPathEdges(nodes, edges, settings) : new Set<number>(),
  };
}

function chooseEndpoints(nodes: PoolNode[], settings: NoiseSettings) {
  if (nodes.length < 2) return null;
  const marginX = settings.width * (0.04 + (1 - settings.pathEndpointSpread) * 0.22);
  const marginY = settings.height * 0.08;
  const pool = nodes.filter((node) => (
    node.x > marginX
    && node.x < settings.width - marginX
    && node.y > marginY
    && node.y < settings.height - marginY
  ));
  const candidates = pool.length > 2 ? pool : nodes;
  let best: [PoolNode, PoolNode] = [candidates[0], candidates[1]];
  let bestScore = -Infinity;
  for (let i = 0; i < candidates.length; i += Math.max(1, Math.floor(candidates.length / 120))) {
    for (let j = i + 1; j < candidates.length; j += Math.max(1, Math.floor(candidates.length / 120))) {
      const a = candidates[i];
      const b = candidates[j];
      const score = Math.hypot(a.x - b.x, a.y - b.y);
      if (score > bestScore) {
        bestScore = score;
        best = [a, b];
      }
    }
  }
  return best;
}

function findPoolPathEdges(nodes: PoolNode[], edges: PoolEdge[], settings: NoiseSettings) {
  const endpoints = chooseEndpoints(nodes, settings);
  if (!endpoints) return new Set<number>();
  const [start, end] = endpoints;
  const adjacency = new Map<number, Array<{ to: number; edgeIndex: number; cost: number }>>();
  edges.forEach((edge, edgeIndex) => {
    const cost = Math.hypot(edge.a.x - edge.b.x, edge.a.y - edge.b.y);
    adjacency.set(edge.a.id, [...(adjacency.get(edge.a.id) ?? []), { to: edge.b.id, edgeIndex, cost }]);
    adjacency.set(edge.b.id, [...(adjacency.get(edge.b.id) ?? []), { to: edge.a.id, edgeIndex, cost }]);
  });

  const distances = new Map<number, number>([[start.id, 0]]);
  const previous = new Map<number, { node: number; edgeIndex: number }>();
  const queue = new Set(nodes.map((node) => node.id));

  while (queue.size) {
    let current = -1;
    let best = Infinity;
    for (const id of queue) {
      const score = distances.get(id) ?? Infinity;
      if (score < best) {
        best = score;
        current = id;
      }
    }
    if (current === -1 || current === end.id) break;
    queue.delete(current);

    for (const next of adjacency.get(current) ?? []) {
      if (!queue.has(next.to)) continue;
      const score = best + next.cost;
      if (score < (distances.get(next.to) ?? Infinity)) {
        distances.set(next.to, score);
        previous.set(next.to, { node: current, edgeIndex: next.edgeIndex });
      }
    }
  }

  const path = new Set<number>();
  let cursor = end.id;
  while (previous.has(cursor)) {
    const step = previous.get(cursor)!;
    path.add(step.edgeIndex);
    cursor = step.node;
  }
  return path;
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Could not create shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) ?? 'Unknown shader error';
    gl.deleteShader(shader);
    throw new Error(info);
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext, vertexSource: string, fragmentSource: string) {
  const program = gl.createProgram();
  if (!program) throw new Error('Could not create program');
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? 'Could not link program');
  }
  return program;
}

function getUniform(gl: WebGLRenderingContext, program: WebGLProgram, name: string) {
  const uniform = gl.getUniformLocation(program, name);
  if (!uniform) throw new Error(`Missing uniform ${name}`);
  return uniform;
}

function createGlBundle(canvas: HTMLCanvasElement): GlBundle | null {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: true,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true,
  });
  if (!gl) return null;

  const line = createProgram(gl, `
    attribute vec2 a_position;
    attribute float a_alpha;
    uniform vec2 u_resolution;
    varying float v_alpha;
    void main() {
      vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
      gl_Position = vec4(clip * vec2(1.0, -1.0), 0.0, 1.0);
      v_alpha = a_alpha;
    }
  `, `
    precision mediump float;
    uniform vec4 u_color;
    varying float v_alpha;
    void main() {
      gl_FragColor = vec4(u_color.rgb, u_color.a * v_alpha);
    }
  `);

  const point = createProgram(gl, `
    attribute vec2 a_position;
    attribute float a_alpha;
    uniform vec2 u_resolution;
    uniform float u_pointSize;
    varying float v_alpha;
    void main() {
      vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
      gl_Position = vec4(clip * vec2(1.0, -1.0), 0.0, 1.0);
      gl_PointSize = u_pointSize;
      v_alpha = a_alpha;
    }
  `, `
    precision mediump float;
    uniform vec4 u_color;
    varying float v_alpha;
    void main() {
      vec2 p = gl_PointCoord - 0.5;
      float d = length(p);
      float edge = smoothstep(0.5, 0.32, d);
      gl_FragColor = vec4(u_color.rgb, u_color.a * v_alpha * edge);
    }
  `);

  const texture = createProgram(gl, `
    attribute vec2 a_position;
    attribute vec2 a_uv;
    varying vec2 v_uv;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
      v_uv = a_uv;
    }
  `, `
    precision mediump float;
    uniform sampler2D u_texture;
    uniform float u_alpha;
    varying vec2 v_uv;
    void main() {
      float v = texture2D(u_texture, v_uv).r;
      gl_FragColor = vec4(vec3(v), u_alpha);
    }
  `);

  return {
    gl,
    line,
    point,
    texture,
    linePosition: gl.getAttribLocation(line, 'a_position'),
    lineAlpha: gl.getAttribLocation(line, 'a_alpha'),
    lineResolution: getUniform(gl, line, 'u_resolution'),
    lineColor: getUniform(gl, line, 'u_color'),
    pointPosition: gl.getAttribLocation(point, 'a_position'),
    pointAlpha: gl.getAttribLocation(point, 'a_alpha'),
    pointResolution: getUniform(gl, point, 'u_resolution'),
    pointColor: getUniform(gl, point, 'u_color'),
    pointSize: getUniform(gl, point, 'u_pointSize'),
    texturePosition: gl.getAttribLocation(texture, 'a_position'),
    textureUv: gl.getAttribLocation(texture, 'a_uv'),
    textureSampler: getUniform(gl, texture, 'u_texture'),
    textureAlpha: getUniform(gl, texture, 'u_alpha'),
  };
}

function uploadAttribute(gl: WebGLRenderingContext, attribute: number, size: number, values: Float32Array) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, values, gl.STREAM_DRAW);
  gl.enableVertexAttribArray(attribute);
  gl.vertexAttribPointer(attribute, size, gl.FLOAT, false, 0, 0);
  return buffer;
}

function drawVertices(
  bundle: GlBundle,
  program: WebGLProgram,
  positionAttribute: number,
  alphaAttribute: number,
  resolutionUniform: WebGLUniformLocation,
  colorUniform: WebGLUniformLocation,
  vertices: number[],
  alphas: number[],
  mode: number,
  color: readonly number[],
  pointSize?: number,
) {
  if (!vertices.length) return;
  const { gl } = bundle;
  gl.useProgram(program);
  gl.uniform2f(resolutionUniform, gl.canvas.width, gl.canvas.height);
  gl.uniform4f(colorUniform, color[0], color[1], color[2], color[3]);
  if (pointSize !== undefined) gl.uniform1f(bundle.pointSize, pointSize);
  const positionBuffer = uploadAttribute(gl, positionAttribute, 2, new Float32Array(vertices));
  const alphaBuffer = uploadAttribute(gl, alphaAttribute, 1, new Float32Array(alphas));
  gl.drawArrays(mode, 0, vertices.length / 2);
  gl.deleteBuffer(positionBuffer);
  gl.deleteBuffer(alphaBuffer);
}

function curveControlPoint(a: { x: number; y: number }, b: { x: number; y: number }, organicity: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length < 4 || organicity <= 0.01) return null;
  const hash = Math.sin(a.x * 12.9898 + a.y * 78.233 + b.x * 37.719 + b.y * 19.19) * 43758.5453;
  const signed = (hash - Math.floor(hash)) * 2 - 1;
  const bend = signed * organicity * Math.min(26, length * 0.42);
  return {
    x: (a.x + b.x) * 0.5 + (-dy / length) * bend,
    y: (a.y + b.y) * 0.5 + (dx / length) * bend,
  };
}

function quadraticPoint(
  a: { x: number; y: number },
  control: { x: number; y: number },
  b: { x: number; y: number },
  t: number,
) {
  const inv = 1 - t;
  return {
    x: inv * inv * a.x + 2 * inv * t * control.x + t * t * b.x,
    y: inv * inv * a.y + 2 * inv * t * control.y + t * t * b.y,
  };
}

function pushConnection(
  vertices: number[],
  alphas: number[],
  a: { x: number; y: number },
  b: { x: number; y: number },
  alpha: number,
  organicity: number,
) {
  const control = curveControlPoint(a, b, organicity);
  if (!control) {
    vertices.push(a.x, a.y, b.x, b.y);
    alphas.push(alpha, alpha);
    return;
  }

  const segments = organicity > 0.55 ? 4 : 3;
  let previous = a;
  for (let i = 1; i <= segments; i += 1) {
    const next = quadraticPoint(a, control, b, i / segments);
    vertices.push(previous.x, previous.y, next.x, next.y);
    alphas.push(alpha, alpha);
    previous = next;
  }
}

function drawNoiseTexture(bundle: GlBundle, settings: NoiseSettings, seed: number, phase: number) {
  if (!settings.showMap) return;
  const { gl } = bundle;
  const scale = 8;
  const width = Math.ceil(settings.width / scale);
  const height = Math.ceil(settings.height / scale);
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = Math.round(sampleNoise(seed, x * scale, y * scale, settings, phase) * 255);
      const index = (y * width + x) * 4;
      pixels[index] = value;
      pixels[index + 1] = value;
      pixels[index + 2] = value;
      pixels[index + 3] = 255;
    }
  }

  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  gl.useProgram(bundle.texture);
  gl.uniform1i(bundle.textureSampler, 0);
  gl.uniform1f(bundle.textureAlpha, 0.32);
  const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
  const uvs = new Float32Array([0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0]);
  const positionBuffer = uploadAttribute(gl, bundle.texturePosition, 2, vertices);
  const uvBuffer = uploadAttribute(gl, bundle.textureUv, 2, uvs);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  gl.deleteBuffer(positionBuffer);
  gl.deleteBuffer(uvBuffer);
  gl.deleteTexture(texture);
}

function buildFrameGeometry(pool: PatternPool, settings: NoiseSettings, phase: number) {
  const weights = new Float32Array(pool.nodes.length);
  const active = new Uint8Array(pool.nodes.length);
  const connected = new Uint8Array(pool.nodes.length);
  const threshold = 0.38 - settings.nodeDensity * 0.16;
  const lineVertices: number[] = [];
  const lineAlphas: number[] = [];
  const pathVertices: number[] = [];
  const pathAlphas: number[] = [];
  const nodeVertices: number[] = [];
  const nodeAlphas: number[] = [];
  const stubVertices: number[] = [];
  const stubAlphas: number[] = [];
  const stubNodeVertices: number[] = [];
  const stubNodeAlphas: number[] = [];

  for (const node of pool.nodes) {
    const weight = morphValue(node.baseWeight, node.morphWeights, settings, phase);
    weights[node.id] = weight;
    active[node.id] = weight > threshold && node.gate < 0.2 + weight * 0.9 ? 1 : 0;
  }

  for (const edge of pool.edges) {
    if (!active[edge.a.id] || !active[edge.b.id]) continue;
    const midpointWeight = morphValue(edge.baseWeight, edge.morphWeights, settings, phase);
    if (midpointWeight < 0.22) continue;
    if (edge.gate >= 0.16 + settings.connectionDensity * 0.46 + edge.angle * settings.angleBias * 0.24) continue;
    const targetVertices = pool.pathEdges.has(edge.id) ? pathVertices : lineVertices;
    const targetAlphas = pool.pathEdges.has(edge.id) ? pathAlphas : lineAlphas;
    pushConnection(
      targetVertices,
      targetAlphas,
      edge.a,
      edge.b,
      0.34 + midpointWeight * 0.48,
      settings.organicity * 1.45,
    );
    connected[edge.a.id] = 1;
    connected[edge.b.id] = 1;
  }

  const stubChance = 0.015 + settings.organicity * 0.075;
  for (const node of pool.nodes) {
    if (!active[node.id] || node.stubGate > stubChance * (0.5 + weights[node.id])) continue;
    const end = {
      x: node.x + Math.cos(node.stubAngle) * node.stubLength,
      y: node.y + Math.sin(node.stubAngle) * node.stubLength,
    };
    if (end.x <= 0 || end.x >= settings.width || end.y <= 0 || end.y >= settings.height) continue;
    const stubWeight = morphValue(node.stubBaseWeight, node.stubMorphWeights, settings, phase);
    if (stubWeight < 0.18) continue;
    pushConnection(
      stubVertices,
      stubAlphas,
      node,
      end,
      0.28 + stubWeight * 0.38,
      settings.organicity * 1.75,
    );
    connected[node.id] = 1;
    stubNodeVertices.push(end.x, end.y);
    stubNodeAlphas.push(0.38 + stubWeight * 0.36);
  }

  for (const node of pool.nodes) {
    if (!active[node.id] || !connected[node.id]) continue;
    nodeVertices.push(node.x, node.y);
    nodeAlphas.push(0.52 + weights[node.id] * 0.48);
  }

  return {
    lineVertices,
    lineAlphas,
    pathVertices,
    pathAlphas,
    nodeVertices,
    nodeAlphas,
    stubVertices,
    stubAlphas,
    stubNodeVertices,
    stubNodeAlphas,
  };
}

function renderWebgl(bundle: GlBundle, pool: PatternPool, settings: NoiseSettings, phase = 0) {
  const { gl } = bundle;
  const width = settings.width;
  const height = settings.height;
  if (gl.canvas.width !== width) gl.canvas.width = width;
  if (gl.canvas.height !== height) gl.canvas.height = height;
  gl.viewport(0, 0, width, height);
  const background = hexToRgba(settings.backgroundColor, settings.transparentBackground ? 0 : 1);
  gl.clearColor(background[0], background[1], background[2], background[3]);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const seed = hashSeed(settings.seed);
  drawNoiseTexture(bundle, settings, seed, phase);

  const frame = buildFrameGeometry(pool, settings, phase);
  gl.lineWidth(Math.max(1, settings.lineWidth));
  drawVertices(bundle, bundle.line, bundle.linePosition, bundle.lineAlpha, bundle.lineResolution, bundle.lineColor, frame.lineVertices, frame.lineAlphas, gl.LINES, hexToRgba(settings.lineColor, 0.9));
  drawVertices(bundle, bundle.line, bundle.linePosition, bundle.lineAlpha, bundle.lineResolution, bundle.lineColor, frame.stubVertices, frame.stubAlphas, gl.LINES, hexToRgba(settings.lineColor, 0.72));
  gl.lineWidth(Math.max(1, settings.pathThickness));
  drawVertices(bundle, bundle.line, bundle.linePosition, bundle.lineAlpha, bundle.lineResolution, bundle.lineColor, frame.pathVertices, frame.pathAlphas, gl.LINES, hexToRgba(settings.pathColor, 0.96));
  drawVertices(bundle, bundle.point, bundle.pointPosition, bundle.pointAlpha, bundle.pointResolution, bundle.pointColor, frame.nodeVertices, frame.nodeAlphas, gl.POINTS, hexToRgba(settings.nodeColor, 1), Math.max(1.2, settings.nodeSize * 2.3));
  drawVertices(bundle, bundle.point, bundle.pointPosition, bundle.pointAlpha, bundle.pointResolution, bundle.pointColor, frame.stubNodeVertices, frame.stubNodeAlphas, gl.POINTS, hexToRgba(settings.nodeColor, 0.88), Math.max(1, settings.nodeSize * 1.45));
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 3000);
}

function preferredVideoMimeType() {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm',
  ];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? '';
}

async function exportLoopVideo(settings: NoiseSettings) {
  if (!('MediaRecorder' in window)) {
    globalThis.alert('Video export is not supported in this browser.');
    return;
  }

  const canvas = document.createElement('canvas');
  const bundle = createGlBundle(canvas);
  if (!bundle) {
    globalThis.alert('WebGL video export is not supported in this browser.');
    return;
  }

  const pool = buildPatternPool(settings);
  const fps = Math.max(6, Math.min(30, Math.round(settings.frameRate)));
  const duration = Math.max(2, settings.loopDuration);
  const frameCount = Math.ceil(duration * fps);
  const mimeType = preferredVideoMimeType();
  const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
  renderWebgl(bundle, pool, settings, 0);
  const stream = canvas.captureStream(fps);
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
  const chunks: BlobPart[] = [];

  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  recorder.start();
  for (let frame = 0; frame < frameCount; frame += 1) {
    renderWebgl(bundle, pool, settings, frame / frameCount);
    track?.requestFrame?.();
    await new Promise((resolve) => window.setTimeout(resolve, 1000 / fps));
  }
  recorder.stop();
  await stopped;
  stream.getTracks().forEach((streamTrack) => streamTrack.stop());

  const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
  downloadBlob(blob, `truecourse-pattern-${settings.seed.replace(/[^a-z0-9-]/gi, '-')}.${extension}`);
}

export function NoiseCanvas({ settings }: { settings: NoiseSettings }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<GlBundle | null>(null);
  const lastVideoNonceRef = useRef(settings.videoExportNonce);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    glRef.current = createGlBundle(canvas);
  }, []);

  useEffect(() => {
    const bundle = glRef.current;
    if (!bundle) return;
    const pool = buildPatternPool(settings);
    let animationId = 0;
    let lastFrameAt = 0;

    const tick = (now: number) => {
      const frameInterval = 1000 / Math.max(1, settings.frameRate);
      if (now - lastFrameAt >= frameInterval) {
        lastFrameAt = now;
        const phase = ((now / 1000) % settings.loopDuration) / settings.loopDuration;
        renderWebgl(bundle, pool, settings, phase);
      }
      animationId = window.requestAnimationFrame(tick);
    };

    renderWebgl(bundle, pool, settings, 0);
    if (settings.motionEnabled) animationId = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(animationId);
  }, [settings]);

  useEffect(() => {
    if (settings.videoExportNonce === lastVideoNonceRef.current) return;
    lastVideoNonceRef.current = settings.videoExportNonce;
    void exportLoopVideo(settings);
  }, [settings]);

  return (
    <div className="preview-stage">
      <canvas ref={canvasRef} className="pattern-canvas lab-canvas noise-canvas" aria-label="Weighted network preview" />
    </div>
  );
}
