import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
} from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { hashSeed } from '../generation/random';

export type PathWaypoint = {
  x: number;
  y: number;
};

export type GradientStop = {
  color: string;
  position: number;
};

export type GradientControlKey =
  | 'gradientStop1Position'
  | 'gradientStop2Position'
  | 'gradientStop3Position'
  | 'gradientStop4Position'
  | 'gradientStop5Position'
  | 'gradientStop6Position';

export type GradientControlChange =
  | { type: 'stop-position'; key: GradientControlKey; value: number }
  | { type: 'gradient-start'; x: number; y: number }
  | { type: 'gradient-end'; x: number; y: number };

export type TerrainCameraControlKey =
  | 'positionX'
  | 'positionY'
  | 'positionZ'
  | 'targetX'
  | 'targetY'
  | 'targetZ'
  | 'fov';

export type TerrainCameraControlChange = {
  key: TerrainCameraControlKey;
  value: number;
};

export type NoiseSettings = {
  seed: string;
  source: 'noise' | 'svg' | 'video' | 'image';
  renderMode: 'flat' | 'terrain';
  svgDataUrl: string | null;
  svgMode: '2d' | '3d';
  svgNoiseEnabled: boolean;
  svgPositionX: number;
  svgPositionY: number;
  svgScale: number;
  svgExtrude: number;
  svgAnimate: boolean;
  videoDataUrl: string | null;
  imageDataUrl: string | null;
  videoThreshold: number;
  videoInvert: boolean;
  videoPositionX: number;
  videoPositionY: number;
  videoScale: number;
  terrainHeight: number;
  terrainDepth: number;
  terrainCoverage: number;
  terrainGlow: number;
  terrainCameraPositionX: number;
  terrainCameraPositionY: number;
  terrainCameraPositionZ: number;
  terrainCameraTargetX: number;
  terrainCameraTargetY: number;
  terrainCameraTargetZ: number;
  terrainCameraFov: number;
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
  foregroundColor: string;
  colorMode: 'solid' | 'gradient';
  gradientType: 'linear' | 'radial';
  gradientEdit: boolean;
  gradientAngle: number;
  gradientStartX: number;
  gradientStartY: number;
  gradientEndX: number;
  gradientEndY: number;
  gradientRadius: number;
  gradientStops: GradientStop[];
  pathEnabled: boolean;
  pathMode: 'auto' | 'manual';
  pathManualPoints: PathWaypoint[];
  pathSnapRadius: number;
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

type PathConnection = {
  a: { x: number; y: number };
  b: { x: number; y: number };
  aId?: number;
  bId?: number;
  weight: number;
};

type PatternPool = {
  nodes: PoolNode[];
  edges: PoolEdge[];
  pathEdges: Set<number>;
  pathConnections: PathConnection[];
  pathPointIds: Set<number>;
};

type FrameGeometry = {
  lineVertices: number[];
  lineAlphas: number[];
  pathVertices: number[];
  pathAlphas: number[];
  pathPointVertices: number[];
  pathPointAlphas: number[];
  nodeVertices: number[];
  nodeAlphas: number[];
  stubVertices: number[];
  stubAlphas: number[];
  stubNodeVertices: number[];
  stubNodeAlphas: number[];
};

type FieldMask = {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
};

type SvgOrbit = {
  position: THREE.Vector3;
  target: THREE.Vector3;
};

type PreviewSize = {
  width: number;
  height: number;
};

type Svg3dMaskCache = {
  key: string;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  group: THREE.Group;
  material: THREE.MeshBasicMaterial;
  canvas: HTMLCanvasElement;
  maskContext: CanvasRenderingContext2D;
};

let svg3dMaskCache: Svg3dMaskCache | null = null;

type VideoMaskCache = {
  src: string;
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
};

let videoMaskCache: VideoMaskCache | null = null;

type ImageMaskCache = {
  src: string;
  image: HTMLImageElement;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
};

let imageMaskCache: ImageMaskCache | null = null;

function cloneOrbit(orbit: SvgOrbit | null): SvgOrbit | null {
  if (!orbit) return null;
  return {
    position: orbit.position.clone(),
    target: orbit.target.clone(),
  };
}

type GlBundle = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera | THREE.PerspectiveCamera;
  lineMaterial: THREE.ShaderMaterial;
  pointMaterial: THREE.ShaderMaterial;
};

type PatternPoolCache = {
  key: string;
  mask: FieldMask | null;
  pool: PatternPool;
};

type PatternPoolCacheRef = {
  current: PatternPoolCache | null;
};

type FrameGeometryCache = {
  key: string;
  mask: FieldMask | null;
  frame: FrameGeometry;
};

type FrameGeometryCacheRef = {
  current: FrameGeometryCache | null;
};

class MinHeap<T> {
  private items: Array<{ item: T; priority: number }> = [];

  push(item: T, priority: number) {
    this.items.push({ item, priority });
    this.bubbleUp(this.items.length - 1);
  }

  pop() {
    if (!this.items.length) return null;
    const top = this.items[0];
    const last = this.items.pop();
    if (last && this.items.length) {
      this.items[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  get size() {
    return this.items.length;
  }

  private bubbleUp(index: number) {
    let current = index;
    while (current > 0) {
      const parent = Math.floor((current - 1) / 2);
      if (this.items[parent].priority <= this.items[current].priority) break;
      [this.items[parent], this.items[current]] = [this.items[current], this.items[parent]];
      current = parent;
    }
  }

  private bubbleDown(index: number) {
    let current = index;
    while (true) {
      const left = current * 2 + 1;
      const right = left + 1;
      let smallest = current;
      if (left < this.items.length && this.items[left].priority < this.items[smallest].priority) smallest = left;
      if (right < this.items.length && this.items[right].priority < this.items[smallest].priority) smallest = right;
      if (smallest === current) break;
      [this.items[current], this.items[smallest]] = [this.items[smallest], this.items[current]];
      current = smallest;
    }
  }
}

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

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function shaderGradientStops(settings: NoiseSettings) {
  return settings.gradientStops
    .map((stop) => ({
      color: hexToRgba(stop.color, 1),
      position: clamp01(stop.position),
    }))
    .sort((a, b) => a.position - b.position);
}

function applyPaintUniforms(
  material: THREE.ShaderMaterial,
  settings: NoiseSettings,
  color: readonly number[],
  useGradient: boolean,
) {
  const uniforms = material.uniforms;
  const stops = shaderGradientStops(settings);
  const fallbackStop = stops[stops.length - 1] ?? { color: hexToRgba(settings.foregroundColor, 1), position: 1 };
  const paddedStops = Array.from({ length: 6 }, (_, index) => stops[index] ?? fallbackStop);
  uniforms.u_color.value.set(color[0], color[1], color[2], color[3]);
  uniforms.u_colorMode.value = useGradient && settings.colorMode === 'gradient' ? 1 : 0;
  uniforms.u_gradientType.value = settings.gradientType === 'radial' ? 1 : 0;
  uniforms.u_gradientStart.value.set(clamp01(settings.gradientStartX), clamp01(settings.gradientStartY));
  uniforms.u_gradientEnd.value.set(clamp01(settings.gradientEndX), clamp01(settings.gradientEndY));
  uniforms.u_canvasSize.value.set(Math.max(1, settings.width), Math.max(1, settings.height));
  uniforms.u_stopCount.value = Math.max(2, Math.min(6, stops.length));
  uniforms.u_stopPositions.value = paddedStops.map((stop) => stop.position);
  uniforms.u_stopColors.value.forEach((stopColor: THREE.Vector4, index: number) => {
    const stop = paddedStops[index];
    stopColor.set(stop.color[0], stop.color[1], stop.color[2], 1);
  });
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

function sampleMask(mask: FieldMask | null, x: number, y: number) {
  if (!mask) return 0;
  const px = Math.max(0, Math.min(mask.width - 1, Math.round(x)));
  const py = Math.max(0, Math.min(mask.height - 1, Math.round(y)));
  return mask.pixels[(py * mask.width + px) * 4] / 255;
}

function shouldUseNoiseInsideSvg(settings: NoiseSettings) {
  return settings.svgNoiseEnabled || (settings.motionEnabled && settings.svgMode === '2d');
}

function isMaskedSource(settings: NoiseSettings) {
  return settings.source === 'svg' || settings.source === 'video' || settings.source === 'image';
}

function sampleSourceField(seed: number, x: number, y: number, settings: NoiseSettings, mask: FieldMask | null, phase = 0) {
  if (settings.source === 'svg') {
    const maskValue = sampleMask(mask, x, y);
    if (!shouldUseNoiseInsideSvg(settings)) return maskValue;
    return maskValue * sampleNoise(seed, x, y, settings, phase);
  }
  if (settings.source === 'video' || settings.source === 'image') return sampleMask(mask, x, y);
  return sampleNoise(seed, x, y, settings, phase);
}

function sampleSourceBaseField(seed: number, x: number, y: number, settings: NoiseSettings, mask: FieldMask | null) {
  if (settings.source === 'svg') {
    const maskValue = sampleMask(mask, x, y);
    if (!shouldUseNoiseInsideSvg(settings)) return maskValue;
    return maskValue * sampleNoiseField(seed, x, y, settings);
  }
  return sampleNoiseField(seed, x, y, settings);
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

function buildMorphWeights(seed: number, x: number, y: number, settings: NoiseSettings, mask: FieldMask | null) {
  if (settings.source === 'svg' && !shouldUseNoiseInsideSvg(settings)) {
    const value = sampleSourceBaseField(seed, x, y, settings, mask);
    return [value, value, value, value] as [number, number, number, number];
  }
  const seedStep = 8191;
  return [
    sampleSourceBaseField(seed, x, y, settings, mask),
    sampleSourceBaseField(seed + seedStep, x, y, settings, mask),
    sampleSourceBaseField(seed + seedStep * 2, x, y, settings, mask),
    sampleSourceBaseField(seed + seedStep * 3, x, y, settings, mask),
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

function buildPatternPool(settings: NoiseSettings, mask: FieldMask | null): PatternPool {
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
        baseWeight: sampleSourceBaseField(seed, px, py, settings, mask),
        morphWeights: buildMorphWeights(seed, px, py, settings, mask),
        stubBaseWeight: sampleSourceBaseField(seed, stubX, stubY, settings, mask),
        stubMorphWeights: buildMorphWeights(seed, stubX, stubY, settings, mask),
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
        baseWeight: sampleSourceBaseField(seed, (node.x + candidate.other.x) * 0.5, (node.y + candidate.other.y) * 0.5, settings, mask),
        morphWeights: buildMorphWeights(seed, (node.x + candidate.other.x) * 0.5, (node.y + candidate.other.y) * 0.5, settings, mask),
      });
    }
  }

  const path = settings.pathEnabled ? findPoolPath(nodes, edges, settings) : {
    edges: new Set<number>(),
    connections: [] as PathConnection[],
    pointIds: new Set<number>(),
  };

  return {
    nodes,
    edges,
    pathEdges: path.edges,
    pathConnections: path.connections,
    pathPointIds: path.pointIds,
  };
}

function createSourceMaskKey(settings: NoiseSettings) {
  const resourceSignature = (value: string | null) => (
    value ? `${value.length}:${value.slice(0, 48)}:${value.slice(-48)}` : null
  );
  if (settings.source === 'svg') {
    return JSON.stringify({
      source: settings.source,
      svgDataUrl: resourceSignature(settings.svgDataUrl),
      svgMode: settings.svgMode,
      svgPositionX: settings.svgPositionX,
      svgPositionY: settings.svgPositionY,
      svgScale: settings.svgScale,
      svgExtrude: settings.svgExtrude,
      width: settings.width,
      height: settings.height,
    });
  }
  if (settings.source === 'video' || settings.source === 'image') {
    return JSON.stringify({
      source: settings.source,
      mediaDataUrl: resourceSignature(settings.source === 'video' ? settings.videoDataUrl : settings.imageDataUrl),
      videoThreshold: settings.videoThreshold,
      videoInvert: settings.videoInvert,
      videoPositionX: settings.videoPositionX,
      videoPositionY: settings.videoPositionY,
      videoScale: settings.videoScale,
      width: settings.width,
      height: settings.height,
    });
  }
  return 'noise';
}

function createPatternPoolKey(settings: NoiseSettings) {
  return JSON.stringify({
    seed: settings.seed,
    source: settings.source,
    svgMode: settings.svgMode,
    svgNoiseEnabled: settings.svgNoiseEnabled,
    size: settings.size,
    complexity: settings.complexity,
    contrast: settings.contrast,
    brightness: settings.brightness,
    nodeDensity: settings.nodeDensity,
    connectionDensity: settings.connectionDensity,
    angleBias: settings.angleBias,
    organicity: settings.organicity,
    pathEnabled: settings.pathEnabled,
    pathMode: settings.pathMode,
    pathManualPoints: settings.pathManualPoints,
    pathEndpointSpread: settings.pathEndpointSpread,
    motionEnabled: settings.motionEnabled,
    width: settings.width,
    height: settings.height,
  });
}

function getCachedPatternPool(cacheRef: PatternPoolCacheRef, settings: NoiseSettings, mask: FieldMask | null) {
  const key = createPatternPoolKey(settings);
  const cached = cacheRef.current;
  if (cached?.key === key && cached.mask === mask) return cached.pool;
  const pool = buildPatternPool(settings, mask);
  cacheRef.current = { key, mask, pool };
  return pool;
}

function createFrameGeometryKey(pool: PatternPool, settings: NoiseSettings, phase: number) {
  return JSON.stringify({
    poolKey: createPatternPoolKey(settings),
    phase: settings.motionEnabled ? Number(phase.toFixed(4)) : 0,
    source: settings.source,
    svgNoiseEnabled: settings.svgNoiseEnabled,
    svgMode: settings.svgMode,
    nodeDensity: settings.nodeDensity,
    connectionDensity: settings.connectionDensity,
    angleBias: settings.angleBias,
    organicity: settings.organicity,
    motionEnabled: settings.motionEnabled,
    motionAmount: settings.motionAmount,
    nodeCount: pool.nodes.length,
    edgeCount: pool.edges.length,
  });
}

function getCachedFrameGeometry(
  cacheRef: FrameGeometryCacheRef | undefined,
  pool: PatternPool,
  settings: NoiseSettings,
  phase: number,
  mask: FieldMask | null,
) {
  if (!cacheRef || settings.motionEnabled) return buildFrameGeometry(pool, settings, phase, mask);
  const key = createFrameGeometryKey(pool, settings, phase);
  const cached = cacheRef.current;
  if (cached?.key === key && cached.mask === mask) return cached.frame;
  const frame = buildFrameGeometry(pool, settings, phase, mask);
  cacheRef.current = { key, mask, frame };
  return frame;
}

function chooseEndpoints(nodes: PoolNode[], settings: NoiseSettings) {
  if (nodes.length < 2) return null;
  const horizontal = settings.width >= settings.height;
  const majorSize = horizontal ? settings.width : settings.height;
  const crossSize = horizontal ? settings.height : settings.width;
  const majorMargin = majorSize * (0.04 + (1 - settings.pathEndpointSpread) * 0.18);
  const crossCenter = crossSize * 0.5;
  const crossLimit = crossSize * (0.18 + settings.pathEndpointSpread * 0.24);
  const marginX = horizontal ? majorMargin : settings.width * 0.08;
  const marginY = horizontal ? settings.height * 0.08 : majorMargin;
  const pool = nodes.filter((node) => (
    node.x > marginX
    && node.x < settings.width - marginX
    && node.y > marginY
    && node.y < settings.height - marginY
  ));

  const central = pool.filter((node) => {
    const cross = horizontal ? node.y : node.x;
    return Math.abs(cross - crossCenter) <= crossLimit;
  });
  const candidates = central.length > 2 ? central : pool.length > 2 ? pool : nodes;
  const startCandidates = candidates.filter((node) => (horizontal ? node.x : node.y) < majorSize * 0.42);
  const endCandidates = candidates.filter((node) => (horizontal ? node.x : node.y) > majorSize * 0.58);
  const starts = startCandidates.length ? startCandidates : candidates;
  const ends = endCandidates.length ? endCandidates : candidates;
  let best: [PoolNode, PoolNode] = [starts[0], ends[0] === starts[0] ? ends[1] ?? candidates[1] : ends[0]];
  let bestScore = -Infinity;
  for (let i = 0; i < starts.length; i += Math.max(1, Math.floor(starts.length / 80))) {
    for (let j = 0; j < ends.length; j += Math.max(1, Math.floor(ends.length / 80))) {
      const a = starts[i];
      const b = ends[j];
      if (a.id === b.id) continue;
      const majorDistance = Math.abs((horizontal ? b.x - a.x : b.y - a.y));
      const crossA = horizontal ? a.y : a.x;
      const crossB = horizontal ? b.y : b.x;
      const crossPenalty = Math.abs(crossA - crossCenter) + Math.abs(crossB - crossCenter) + Math.abs(crossA - crossB) * 0.35;
      const score = majorDistance - crossPenalty * 0.62;
      if (score > bestScore) {
        bestScore = score;
        best = [a, b];
      }
    }
  }
  return best;
}

function fallbackPathConnections(settings: NoiseSettings) {
  const seed = hashSeed(settings.seed) + 911;
  const random = rng(seed);
  const horizontal = settings.width >= settings.height;
  const majorSize = horizontal ? settings.width : settings.height;
  const crossSize = horizontal ? settings.height : settings.width;
  const majorMargin = majorSize * 0.08;
  const crossCenter = crossSize * 0.5;
  const crossDrift = crossSize * 0.035;
  const pointCount = 9;
  const points: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < pointCount; i += 1) {
    const t = i / (pointCount - 1);
    const major = majorMargin + (majorSize - majorMargin * 2) * t;
    const wave = Math.sin(t * Math.PI * 2 + random() * Math.PI) * crossDrift;
    const jitter = (random() - 0.5) * crossDrift;
    const cross = crossCenter + wave + jitter;
    points.push(horizontal ? { x: major, y: cross } : { x: cross, y: major });
  }

  const connections: PathConnection[] = [];
  for (let i = 1; i < points.length; i += 1) {
    connections.push({ a: points[i - 1], b: points[i], weight: 0.82 });
  }
  return connections;
}

function nearestNodeToWaypoint(nodes: PoolNode[], waypoint: PathWaypoint, settings: NoiseSettings) {
  let closest: PoolNode | null = null;
  let closestDistance = Infinity;
  const x = waypoint.x * settings.width;
  const y = waypoint.y * settings.height;

  for (const node of nodes) {
    const distance = Math.hypot(node.x - x, node.y - y);
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = node;
    }
  }

  return closest;
}

function chooseEndpointFromAnchor(nodes: PoolNode[], anchor: PoolNode, settings: NoiseSettings) {
  const horizontal = settings.width >= settings.height;
  const majorSize = horizontal ? settings.width : settings.height;
  const crossCenter = (horizontal ? settings.height : settings.width) * 0.5;
  let best: PoolNode | null = null;
  let bestScore = -Infinity;

  for (const node of nodes) {
    if (node.id === anchor.id) continue;
    const majorDistance = Math.abs((horizontal ? node.x - anchor.x : node.y - anchor.y));
    const anchorMajor = horizontal ? anchor.x : anchor.y;
    const nodeMajor = horizontal ? node.x : node.y;
    const crossesComposition = anchorMajor < majorSize * 0.5
      ? nodeMajor > majorSize * 0.58
      : nodeMajor < majorSize * 0.42;
    const cross = horizontal ? node.y : node.x;
    const centerPenalty = Math.abs(cross - crossCenter);
    const score = majorDistance + (crossesComposition ? majorSize * 0.35 : 0) - centerPenalty * 0.45;
    if (score > bestScore) {
      bestScore = score;
      best = node;
    }
  }

  return best;
}

function buildPathAdjacency(edges: PoolEdge[], settings: NoiseSettings) {
  const horizontal = settings.width >= settings.height;
  const crossCenter = (horizontal ? settings.height : settings.width) * 0.5;
  const crossSize = horizontal ? settings.height : settings.width;
  const adjacency = new Map<number, Array<{ to: number; edgeIndex: number; cost: number }>>();

  edges.forEach((edge, edgeIndex) => {
    const distance = Math.hypot(edge.a.x - edge.b.x, edge.a.y - edge.b.y);
    const midpointCross = horizontal ? (edge.a.y + edge.b.y) * 0.5 : (edge.a.x + edge.b.x) * 0.5;
    const centerPenalty = Math.abs(midpointCross - crossCenter) / crossSize;
    const weightReward = Math.max(0, Math.min(1, edge.baseWeight));
    const cost = distance * (1 + centerPenalty * 1.8 + (1 - weightReward) * 0.28);
    adjacency.set(edge.a.id, [...(adjacency.get(edge.a.id) ?? []), { to: edge.b.id, edgeIndex, cost }]);
    adjacency.set(edge.b.id, [...(adjacency.get(edge.b.id) ?? []), { to: edge.a.id, edgeIndex, cost }]);
  });

  return adjacency;
}

function findPathSegment(
  adjacency: Map<number, Array<{ to: number; edgeIndex: number; cost: number }>>,
  start: PoolNode,
  end: PoolNode,
) {
  const distances = new Map<number, number>([[start.id, 0]]);
  const previous = new Map<number, { node: number; edgeIndex: number }>();
  const visited = new Set<number>();
  const queue = new MinHeap<number>();
  queue.push(start.id, 0);

  while (queue.size) {
    const nextNode = queue.pop();
    if (!nextNode) break;
    const current = nextNode.item;
    const best = distances.get(current) ?? Infinity;
    if (visited.has(current) || nextNode.priority > best) continue;
    if (current === end.id) break;
    visited.add(current);

    for (const next of adjacency.get(current) ?? []) {
      if (visited.has(next.to)) continue;
      const score = best + next.cost;
      if (score < (distances.get(next.to) ?? Infinity)) {
        distances.set(next.to, score);
        previous.set(next.to, { node: current, edgeIndex: next.edgeIndex });
        queue.push(next.to, score);
      }
    }
  }

  const orderedEdges: number[] = [];
  let cursor = end.id;
  while (previous.has(cursor)) {
    const step = previous.get(cursor)!;
    orderedEdges.push(step.edgeIndex);
    cursor = step.node;
  }

  return cursor === start.id ? orderedEdges.reverse() : [];
}

function orderedConnectionsFromEdges(edges: PoolEdge[], orderedEdges: number[]) {
  return orderedEdges.map((edgeIndex) => {
    const edge = edges[edgeIndex];
    return {
      a: edge.a,
      b: edge.b,
      aId: edge.a.id,
      bId: edge.b.id,
      weight: edge.baseWeight,
    };
  });
}

function findPoolPath(nodes: PoolNode[], edges: PoolEdge[], settings: NoiseSettings) {
  const pointIds = new Set<number>();
  const manualNodes = settings.pathMode === 'manual'
    ? settings.pathManualPoints
      .map((point) => nearestNodeToWaypoint(nodes, point, settings))
      .filter((node): node is PoolNode => Boolean(node))
      .filter((node, index, list) => list.findIndex((item) => item.id === node.id) === index)
    : [];
  for (const node of manualNodes) pointIds.add(node.id);

  let routeNodes = manualNodes;
  if (routeNodes.length === 0) {
    const endpoints = chooseEndpoints(nodes, settings);
    if (!endpoints) {
      return {
        edges: new Set<number>(),
        connections: fallbackPathConnections(settings),
        pointIds,
      };
    }
    routeNodes = endpoints;
  } else if (routeNodes.length === 1) {
    const end = chooseEndpointFromAnchor(nodes, routeNodes[0], settings);
    if (end) routeNodes = [routeNodes[0], end];
  }

  if (routeNodes.length < 2) {
    return {
      edges: new Set<number>(),
      connections: fallbackPathConnections(settings),
      pointIds,
    };
  }

  const adjacency = buildPathAdjacency(edges, settings);
  const orderedEdges: number[] = [];
  const directConnections: PathConnection[] = [];
  for (let i = 1; i < routeNodes.length; i += 1) {
    const segment = findPathSegment(adjacency, routeNodes[i - 1], routeNodes[i]);
    if (segment.length) {
      orderedEdges.push(...segment);
    } else {
      directConnections.push({
        a: routeNodes[i - 1],
        b: routeNodes[i],
        aId: routeNodes[i - 1].id,
        bId: routeNodes[i].id,
        weight: (routeNodes[i - 1].baseWeight + routeNodes[i].baseWeight) * 0.5,
      });
    }
  }
  const path = new Set(orderedEdges);
  const connections = [...orderedConnectionsFromEdges(edges, orderedEdges), ...directConnections];

  return {
    edges: path,
    connections: connections.length ? connections : fallbackPathConnections(settings),
    pointIds,
  };
}

function createGlBundle(canvas: HTMLCanvasElement): GlBundle | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
  } catch {
    return null;
  }
  renderer.autoClear = false;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(1);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, 0, 1, -10, 10);
  const gradientUniforms = () => ({
    u_color: { value: new THREE.Vector4(1, 1, 1, 1) },
    u_colorMode: { value: 0 },
    u_gradientType: { value: 0 },
    u_gradientStart: { value: new THREE.Vector2(0, 0.5) },
    u_gradientEnd: { value: new THREE.Vector2(1, 0.5) },
    u_canvasSize: { value: new THREE.Vector2(1, 1) },
    u_stopCount: { value: 4 },
    u_stopPositions: { value: [0, 0.35, 0.72, 1, 1, 1] },
    u_stopColors: {
      value: [
        new THREE.Vector4(1, 1, 1, 1),
        new THREE.Vector4(1, 1, 1, 1),
        new THREE.Vector4(1, 1, 1, 1),
        new THREE.Vector4(1, 1, 1, 1),
        new THREE.Vector4(1, 1, 1, 1),
        new THREE.Vector4(1, 1, 1, 1),
      ],
    },
  });
  const gradientFragment = `
    uniform vec4 u_color;
    uniform float u_colorMode;
    uniform float u_gradientType;
    uniform vec2 u_gradientStart;
    uniform vec2 u_gradientEnd;
    uniform vec2 u_canvasSize;
    uniform int u_stopCount;
    uniform float u_stopPositions[6];
    uniform vec4 u_stopColors[6];
    varying vec2 v_position;

    vec3 rampColor(float t) {
      vec3 color = u_stopColors[0].rgb;
      for (int i = 1; i < 6; i++) {
        if (i >= u_stopCount) break;
        float previousPosition = u_stopPositions[i - 1];
        float nextPosition = max(u_stopPositions[i], previousPosition + 0.0001);
        vec3 previousColor = u_stopColors[i - 1].rgb;
        vec3 nextColor = u_stopColors[i].rgb;
        color = mix(previousColor, nextColor, smoothstep(previousPosition, nextPosition, t));
        if (t <= nextPosition) break;
      }
      return color;
    }

    vec3 paintColor() {
      if (u_colorMode < 0.5) return u_color.rgb;
      vec2 uv = v_position / u_canvasSize;
      float t = 0.0;
      vec2 gradientVector = u_gradientEnd - u_gradientStart;
      float gradientLength = max(0.0001, length(gradientVector));
      if (u_gradientType < 0.5) {
        vec2 direction = gradientVector / gradientLength;
        t = dot(uv - u_gradientStart, direction) / gradientLength;
      } else {
        t = distance(uv, u_gradientStart) / gradientLength;
      }
      return rampColor(clamp(t, 0.0, 1.0));
    }
  `;

  const lineMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: gradientUniforms(),
    vertexShader: `
    attribute float a_alpha;
    varying float v_alpha;
    varying vec2 v_position;
    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      v_alpha = a_alpha;
      v_position = position.xy;
    }
    `,
    fragmentShader: `
    precision mediump float;
    varying float v_alpha;
    ${gradientFragment}
    void main() {
      gl_FragColor = vec4(paintColor(), u_color.a * v_alpha);
    }
    `,
  });

  const pointMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      ...gradientUniforms(),
      u_pointSize: { value: 1 },
    },
    vertexShader: `
    attribute float a_alpha;
    uniform float u_pointSize;
    varying float v_alpha;
    varying vec2 v_position;
    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = u_pointSize;
      v_alpha = a_alpha;
      v_position = position.xy;
    }
    `,
    fragmentShader: `
    precision mediump float;
    varying float v_alpha;
    ${gradientFragment}
    void main() {
      vec2 p = gl_PointCoord - 0.5;
      float d = length(p);
      float edge = smoothstep(0.5, 0.32, d);
      gl_FragColor = vec4(paintColor(), u_color.a * v_alpha * edge);
    }
    `,
  });

  return {
    renderer,
    scene,
    camera,
    lineMaterial,
    pointMaterial,
  };
}

function drawVertices(
  bundle: GlBundle,
  vertices: number[],
  alphas: number[],
  mode: 'lines' | 'points',
  color: readonly number[],
  settings: NoiseSettings,
  useGradient = false,
  size?: number,
) {
  if (!vertices.length) return;

  const geometry = new THREE.BufferGeometry();
  let object: THREE.LineSegments | THREE.Mesh | THREE.Points;

  if (mode === 'lines') {
    const strokeWidth = Math.max(0.1, size ?? 1);
    const halfWidth = strokeWidth * 0.5;
    const positions: number[] = [];
    const strokeAlphas: number[] = [];
    const indices: number[] = [];

    for (let i = 0, alphaIndex = 0; i < vertices.length; i += 4, alphaIndex += 2) {
      const ax = vertices[i];
      const ay = vertices[i + 1];
      const bx = vertices[i + 2];
      const by = vertices[i + 3];
      const dx = bx - ax;
      const dy = by - ay;
      const length = Math.hypot(dx, dy);
      if (length < 0.001) continue;

      const nx = (-dy / length) * halfWidth;
      const ny = (dx / length) * halfWidth;
      const base = positions.length / 3;
      positions.push(
        ax + nx, ay + ny, 0,
        ax - nx, ay - ny, 0,
        bx + nx, by + ny, 0,
        bx - nx, by - ny, 0,
      );
      strokeAlphas.push(
        alphas[alphaIndex] ?? 1,
        alphas[alphaIndex] ?? 1,
        alphas[alphaIndex + 1] ?? alphas[alphaIndex] ?? 1,
        alphas[alphaIndex + 1] ?? alphas[alphaIndex] ?? 1,
      );
      indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
    }

    if (!positions.length) return;
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute('a_alpha', new THREE.BufferAttribute(new Float32Array(strokeAlphas), 1));
    geometry.setIndex(indices);
    object = new THREE.Mesh(geometry, bundle.lineMaterial);
  } else {
    const positions = new Float32Array((vertices.length / 2) * 3);
    for (let i = 0, j = 0; i < vertices.length; i += 2, j += 3) {
      positions[j] = vertices[i];
      positions[j + 1] = vertices[i + 1];
      positions[j + 2] = 0;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('a_alpha', new THREE.BufferAttribute(new Float32Array(alphas), 1));
    object = new THREE.Points(geometry, bundle.pointMaterial);
  }

  const material = mode === 'points' ? bundle.pointMaterial : bundle.lineMaterial;
  applyPaintUniforms(material, settings, color, useGradient);
  if (mode === 'points' && size !== undefined) {
    bundle.pointMaterial.uniforms.u_pointSize.value = size;
  }

  bundle.scene.add(object);
  bundle.renderer.render(bundle.scene, bundle.camera);
  bundle.scene.remove(object);
  geometry.dispose();
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

function connectionStaysInMask(
  mask: FieldMask | null,
  settings: NoiseSettings,
  a: { x: number; y: number },
  b: { x: number; y: number },
  organicity: number,
) {
  if (!isMaskedSource(settings)) return true;
  if (!mask) return false;

  const control = curveControlPoint(a, b, organicity);
  const samples = 7;
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const point = control ? quadraticPoint(a, control, b, t) : {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
    };
    if (sampleMask(mask, point.x, point.y) < 0.48) return false;
  }

  return true;
}

function maskedOrganicity(
  mask: FieldMask | null,
  settings: NoiseSettings,
  a: { x: number; y: number },
  b: { x: number; y: number },
  desired: number,
) {
  if (!isMaskedSource(settings)) return desired;
  const attempts = [desired, desired * 0.7, desired * 0.4, 0];
  for (const organicity of attempts) {
    if (connectionStaysInMask(mask, settings, a, b, organicity)) return organicity;
  }
  return null;
}

function drawNoiseMapOverlay(canvas: HTMLCanvasElement | null, settings: NoiseSettings, seed: number, phase: number, mask: FieldMask | null) {
  if (!canvas) return;
  const context = canvas.getContext('2d');
  if (!context) return;
  const scale = 8;
  const width = Math.ceil(settings.width / scale);
  const height = Math.ceil(settings.height / scale);

  if (!settings.showMap) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    canvas.hidden = true;
    return;
  }

  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  canvas.hidden = false;

  const image = context.createImageData(width, height);
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = Math.round(sampleSourceField(seed, x * scale, y * scale, settings, mask, phase) * 255);
      const index = (y * width + x) * 4;
      pixels[index] = value;
      pixels[index + 1] = value;
      pixels[index + 2] = value;
      pixels[index + 3] = 120;
    }
  }
  image.data.set(pixels);
  context.putImageData(image, 0, 0);
}

function buildFrameGeometry(pool: PatternPool, settings: NoiseSettings, phase: number, mask: FieldMask | null): FrameGeometry {
  const weights = new Float32Array(pool.nodes.length);
  const active = new Uint8Array(pool.nodes.length);
  const connected = new Uint8Array(pool.nodes.length);
  const useSvgNoiseField = settings.source === 'svg' && shouldUseNoiseInsideSvg(settings);
  const useMediaMask = settings.source === 'video' || settings.source === 'image';
  const threshold = isMaskedSource(settings)
    ? (useSvgNoiseField ? 0.26 : 0.5)
    : 0.38 - settings.nodeDensity * 0.16;
  const lineVertices: number[] = [];
  const lineAlphas: number[] = [];
  const pathVertices: number[] = [];
  const pathAlphas: number[] = [];
  const pathPointVertices: number[] = [];
  const pathPointAlphas: number[] = [];
  const nodeVertices: number[] = [];
  const nodeAlphas: number[] = [];
  const stubVertices: number[] = [];
  const stubAlphas: number[] = [];
  const stubNodeVertices: number[] = [];
  const stubNodeAlphas: number[] = [];

  for (const node of pool.nodes) {
    const weight = useMediaMask
      ? sampleMask(mask, node.x, node.y)
      : morphValue(node.baseWeight, node.morphWeights, settings, phase);
    weights[node.id] = weight;
    active[node.id] = weight > threshold && node.gate < 0.2 + weight * 0.9 ? 1 : 0;
  }

  for (const edge of pool.edges) {
    if (pool.pathEdges.has(edge.id)) continue;
    if (!active[edge.a.id] || !active[edge.b.id]) continue;
    const midpointX = (edge.a.x + edge.b.x) * 0.5;
    const midpointY = (edge.a.y + edge.b.y) * 0.5;
    const midpointWeight = useMediaMask
      ? sampleMask(mask, midpointX, midpointY)
      : morphValue(edge.baseWeight, edge.morphWeights, settings, phase);
    if (midpointWeight < (isMaskedSource(settings) ? (useSvgNoiseField ? 0.24 : 0.5) : 0.22)) continue;
    if (edge.gate >= 0.16 + settings.connectionDensity * 0.46 + edge.angle * settings.angleBias * 0.24) continue;
    const desiredOrganicity = isMaskedSource(settings) ? settings.organicity * 1.25 : settings.organicity * 1.45;
    const organicity = maskedOrganicity(mask, settings, edge.a, edge.b, desiredOrganicity);
    if (organicity === null) continue;
    pushConnection(
      lineVertices,
      lineAlphas,
      edge.a,
      edge.b,
      0.34 + midpointWeight * 0.48,
      organicity,
    );
    connected[edge.a.id] = 1;
    connected[edge.b.id] = 1;
  }

  for (const connection of pool.pathConnections) {
    const desiredOrganicity = isMaskedSource(settings) ? settings.organicity * 1.05 : settings.organicity * 0.95;
    const organicity = isMaskedSource(settings)
      ? maskedOrganicity(mask, settings, connection.a, connection.b, desiredOrganicity)
      : desiredOrganicity;
    if (organicity === null) continue;
    pushConnection(
      pathVertices,
      pathAlphas,
      connection.a,
      connection.b,
      0.82 + Math.max(0, Math.min(1, connection.weight)) * 0.14,
      organicity,
    );
    if (connection.aId !== undefined) {
      active[connection.aId] = 1;
      connected[connection.aId] = 1;
      weights[connection.aId] = Math.max(weights[connection.aId], 0.72);
    }
    if (connection.bId !== undefined) {
      active[connection.bId] = 1;
      connected[connection.bId] = 1;
      weights[connection.bId] = Math.max(weights[connection.bId], 0.72);
    }
  }

  for (const nodeId of pool.pathPointIds) {
    const node = pool.nodes[nodeId];
    if (!node) continue;
    pathPointVertices.push(node.x, node.y);
    pathPointAlphas.push(1);
    active[node.id] = 1;
    connected[node.id] = 1;
    weights[node.id] = Math.max(weights[node.id], 0.84);
  }

  const stubChance = 0.015 + settings.organicity * 0.075;
  for (const node of pool.nodes) {
    if (!active[node.id] || node.stubGate > stubChance * (0.5 + weights[node.id])) continue;
    const end = {
      x: node.x + Math.cos(node.stubAngle) * node.stubLength,
      y: node.y + Math.sin(node.stubAngle) * node.stubLength,
    };
    if (end.x <= 0 || end.x >= settings.width || end.y <= 0 || end.y >= settings.height) continue;
    const stubWeight = useMediaMask
      ? sampleMask(mask, end.x, end.y)
      : morphValue(node.stubBaseWeight, node.stubMorphWeights, settings, phase);
    if (stubWeight < (isMaskedSource(settings) ? 0.58 : 0.18)) continue;
    const desiredOrganicity = isMaskedSource(settings) ? settings.organicity * 0.95 : settings.organicity * 1.75;
    const organicity = maskedOrganicity(mask, settings, node, end, desiredOrganicity);
    if (organicity === null) continue;
    pushConnection(
      stubVertices,
      stubAlphas,
      node,
      end,
      0.28 + stubWeight * 0.38,
      organicity,
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
    pathPointVertices,
    pathPointAlphas,
    nodeVertices,
    nodeAlphas,
    stubVertices,
    stubAlphas,
    stubNodeVertices,
    stubNodeAlphas,
  };
}

function renderWebgl(
  bundle: GlBundle,
  pool: PatternPool,
  settings: NoiseSettings,
  mask: FieldMask | null,
  phase = 0,
  frameCacheRef?: FrameGeometryCacheRef,
) {
  const width = settings.width;
  const height = settings.height;
  bundle.renderer.setSize(width, height, false);
  disposeTerrainObjects(bundle.scene);
  const camera = bundle.camera instanceof THREE.OrthographicCamera
    ? bundle.camera
    : new THREE.OrthographicCamera(0, 1, 0, 1, -10, 10);
  bundle.camera = camera;
  camera.left = 0;
  camera.right = width;
  camera.top = 0;
  camera.bottom = height;
  camera.updateProjectionMatrix();
  const background = hexToRgba(settings.backgroundColor, settings.transparentBackground ? 0 : 1);
  bundle.renderer.setClearColor(new THREE.Color(background[0], background[1], background[2]), background[3]);
  bundle.renderer.clear();

  const frame = getCachedFrameGeometry(frameCacheRef, pool, settings, phase, mask);
  drawVertices(bundle, frame.lineVertices, frame.lineAlphas, 'lines', hexToRgba(settings.foregroundColor, 0.9), settings, true, settings.lineWidth);
  drawVertices(bundle, frame.stubVertices, frame.stubAlphas, 'lines', hexToRgba(settings.foregroundColor, 0.72), settings, true, settings.lineWidth * 0.82);
  drawVertices(bundle, frame.pathVertices, frame.pathAlphas, 'lines', hexToRgba(settings.pathColor, 0.96), settings, false, settings.pathThickness);
  drawVertices(bundle, frame.pathPointVertices, frame.pathPointAlphas, 'points', hexToRgba(settings.pathColor, 1), settings, false, Math.max(5.5, settings.pathThickness * 2.6));
  drawVertices(bundle, frame.nodeVertices, frame.nodeAlphas, 'points', hexToRgba(settings.foregroundColor, 1), settings, true, Math.max(1.2, settings.nodeSize * 2.3));
  drawVertices(bundle, frame.stubNodeVertices, frame.stubNodeAlphas, 'points', hexToRgba(settings.foregroundColor, 0.88), settings, true, Math.max(1, settings.nodeSize * 1.45));
}

type TerrainPoint = {
  x: number;
  y: number;
  z: number;
  sourceX: number;
  sourceY: number;
  depth: number;
  weight: number;
};

function terrainBaseWorldSize(settings: NoiseSettings) {
  const depth = 920 * settings.terrainDepth;
  return {
    depth,
    width: depth * (settings.width / Math.max(1, settings.height)),
  };
}

function terrainWorldSize(settings: NoiseSettings) {
  const base = terrainBaseWorldSize(settings);
  const coverage = Math.max(0.1, settings.terrainCoverage);
  return {
    depth: base.depth * coverage,
    width: base.width * coverage,
  };
}

function terrainCameraVectors(settings: NoiseSettings) {
  const world = terrainBaseWorldSize(settings);
  return {
    world,
    position: new THREE.Vector3(
      settings.terrainCameraPositionX * world.width * 0.5,
      settings.terrainCameraPositionY * world.depth,
      settings.terrainCameraPositionZ * world.depth,
    ),
    target: new THREE.Vector3(
      settings.terrainCameraTargetX * world.width * 0.5,
      settings.terrainCameraTargetY * world.depth,
      settings.terrainCameraTargetZ * world.depth,
    ),
  };
}

type TerrainCameraOverride = {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
};

function applyTerrainCameraSettings(camera: THREE.PerspectiveCamera, settings: NoiseSettings, override?: TerrainCameraOverride | null) {
  const { position, target } = override ?? terrainCameraVectors(settings);
  camera.fov = override?.fov ?? settings.terrainCameraFov;
  camera.near = 1;
  camera.far = 5000;
  camera.position.copy(position);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  return target;
}

function terrainCameraValueFromWorld(settings: NoiseSettings, position: THREE.Vector3, target: THREE.Vector3) {
  const world = terrainBaseWorldSize(settings);
  return {
    positionX: position.x / Math.max(1, world.width * 0.5),
    positionY: position.y / Math.max(1, world.depth),
    positionZ: position.z / Math.max(1, world.depth),
    targetX: target.x / Math.max(1, world.width * 0.5),
    targetY: target.y / Math.max(1, world.depth),
    targetZ: target.z / Math.max(1, world.depth),
  };
}
function terrainCameraOverrideMatchesSettings(settings: NoiseSettings, override: TerrainCameraOverride) {
  const values = terrainCameraValueFromWorld(settings, override.position, override.target);
  const close = (a: number, b: number) => Math.abs(a - b) <= 0.003;
  return close(values.positionX, settings.terrainCameraPositionX)
    && close(values.positionY, settings.terrainCameraPositionY)
    && close(values.positionZ, settings.terrainCameraPositionZ)
    && close(values.targetX, settings.terrainCameraTargetX)
    && close(values.targetY, settings.terrainCameraTargetY)
    && close(values.targetZ, settings.terrainCameraTargetZ)
    && close(override.fov, settings.terrainCameraFov);
}
function terrainNodeScreenPosition(
  node: PoolNode,
  settings: NoiseSettings,
  mask: FieldMask | null,
  camera: THREE.PerspectiveCamera,
  bounds: DOMRect,
) {
  const point = terrainPoint(hashSeed(settings.seed), node.x, node.y, settings, mask, 0);
  const projected = new THREE.Vector3(point.x, point.y, point.z).project(camera);
  if (projected.z < -1 || projected.z > 1) return null;
  return {
    x: (projected.x * 0.5 + 0.5) * bounds.width,
    y: (-projected.y * 0.5 + 0.5) * bounds.height,
  };
}

function nearestTerrainNodeToPointer(
  pool: PatternPool,
  settings: NoiseSettings,
  mask: FieldMask | null,
  camera: THREE.PerspectiveCamera,
  bounds: DOMRect,
  pointerX: number,
  pointerY: number,
) {
  const seed = hashSeed(settings.seed);
  const useSvgNoiseField = settings.source === 'svg' && shouldUseNoiseInsideSvg(settings);
  const threshold = isMaskedSource(settings)
    ? (useSvgNoiseField ? 0.26 : 0.5)
    : 0.38 - settings.nodeDensity * 0.16;
  let closest: PoolNode | null = null;
  let closestDistance = Infinity;

  for (const node of pool.nodes) {
    const weight = terrainWeight(seed, node.x, node.y, settings, mask, 0);
    const isVisible = (weight > threshold && node.gate < 0.2 + weight * 0.9) || pool.pathPointIds.has(node.id);
    if (!isVisible) continue;
    const screen = terrainNodeScreenPosition(node, settings, mask, camera, bounds);
    if (!screen) continue;
    const distance = Math.hypot(screen.x - pointerX, screen.y - pointerY);
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = node;
    }
  }

  return { node: closest, distance: closestDistance };
}

function terrainWeight(seed: number, x: number, y: number, settings: NoiseSettings, mask: FieldMask | null, phase: number) {
  if (settings.source === 'video' || settings.source === 'image') return sampleMask(mask, x, y);
  return sampleSourceField(seed, x, y, settings, mask, phase);
}

function terrainPoint(seed: number, x: number, y: number, settings: NoiseSettings, mask: FieldMask | null, phase: number): TerrainPoint {
  const { depth: worldDepth, width: worldWidth } = terrainWorldSize(settings);
  const depth = y / Math.max(1, settings.height);
  const weight = terrainWeight(seed, x, y, settings, mask, phase);
  const ridge = Math.pow(Math.max(0, weight), 1.65);
  return {
    x: (x / Math.max(1, settings.width) - 0.5) * worldWidth,
    y: (ridge - 0.28) * 280 * settings.terrainHeight,
    z: (depth - 0.5) * worldDepth,
    sourceX: x,
    sourceY: y,
    depth,
    weight,
  };
}

function terrainGradientT(settings: NoiseSettings, x: number, y: number) {
  const uvX = x / Math.max(1, settings.width);
  const uvY = y / Math.max(1, settings.height);
  const startX = clamp01(settings.gradientStartX);
  const startY = clamp01(settings.gradientStartY);
  const endX = clamp01(settings.gradientEndX);
  const endY = clamp01(settings.gradientEndY);
  const vectorX = endX - startX;
  const vectorY = endY - startY;
  const length = Math.max(0.0001, Math.hypot(vectorX, vectorY));

  if (settings.gradientType === 'radial') {
    return clamp01(Math.hypot(uvX - startX, uvY - startY) / length);
  }

  const directionX = vectorX / length;
  const directionY = vectorY / length;
  return clamp01(((uvX - startX) * directionX + (uvY - startY) * directionY) / length);
}

function rampColorAt(settings: NoiseSettings, t: number) {
  const stops = shaderGradientStops(settings);
  if (settings.colorMode !== 'gradient' || !stops.length) return hexToRgba(settings.foregroundColor, 1);
  let previous = stops[0];
  let next = stops[stops.length - 1];
  for (let index = 1; index < stops.length; index += 1) {
    if (t <= stops[index].position) {
      previous = stops[index - 1];
      next = stops[index];
      break;
    }
  }
  const mix = smoothstep(clamp01((t - previous.position) / Math.max(0.0001, next.position - previous.position)));
  return [
    previous.color[0] + (next.color[0] - previous.color[0]) * mix,
    previous.color[1] + (next.color[1] - previous.color[1]) * mix,
    previous.color[2] + (next.color[2] - previous.color[2]) * mix,
    1,
  ] as const;
}

function boostedRgb(color: readonly number[], weight: number, boost = 0) {
  const lift = 0.22 + weight * 0.78 + boost;
  return [
    Math.min(1, color[0] * lift),
    Math.min(1, color[1] * lift),
    Math.min(1, color[2] * lift),
  ];
}

function terrainColor(settings: NoiseSettings, x: number, y: number, weight: number, boost = 0) {
  return boostedRgb(rampColorAt(settings, terrainGradientT(settings, x, y)), weight, boost);
}

function terrainSolidColor(color: string, weight: number, boost = 0) {
  return boostedRgb(hexToRgba(color, 1), weight, boost);
}

function pushTerrainPolyline(
  positions: number[],
  colors: number[],
  seed: number,
  a: { x: number; y: number },
  b: { x: number; y: number },
  settings: NoiseSettings,
  mask: FieldMask | null,
  phase: number,
  organicity: number,
  boost = 0,
  colorOverride?: string,
) {
  const control = curveControlPoint(a, b, organicity);
  const samples = 5;
  let previous: TerrainPoint | null = null;
  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples;
    const point = control ? quadraticPoint(a, control, b, t) : {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
    };
    const current = terrainPoint(seed, point.x, point.y, settings, mask, phase);
    if (previous) {
      positions.push(previous.x, previous.y, previous.z, current.x, current.y, current.z);
      colors.push(
        ...(colorOverride
          ? terrainSolidColor(colorOverride, previous.weight, boost)
          : terrainColor(settings, previous.sourceX, previous.sourceY, previous.weight, boost)),
        ...(colorOverride
          ? terrainSolidColor(colorOverride, current.weight, boost)
          : terrainColor(settings, point.x, point.y, current.weight, boost)),
      );
    }
    previous = current;
  }
}

function disposeTerrainObjects(scene: THREE.Scene) {
  for (const object of [...scene.children]) {
    scene.remove(object);
    if ('geometry' in object && object.geometry instanceof THREE.BufferGeometry) object.geometry.dispose();
    if ('material' in object) {
      const material = object.material;
      if (Array.isArray(material)) material.forEach((item) => item.dispose());
      else if (material instanceof THREE.Material) material.dispose();
    }
  }
}

function renderTerrainWebgl(
  bundle: GlBundle,
  pool: PatternPool,
  settings: NoiseSettings,
  mask: FieldMask | null,
  phase = 0,
  terrainCameraOverride?: TerrainCameraOverride | null,
) {
  const width = settings.width;
  const height = settings.height;
  bundle.renderer.setSize(width, height, false);
  disposeTerrainObjects(bundle.scene);

  const background = hexToRgba(settings.backgroundColor, settings.transparentBackground ? 0 : 1);
  bundle.renderer.setClearColor(new THREE.Color(background[0], background[1], background[2]), background[3]);
  bundle.renderer.clear();

  const aspect = width / Math.max(1, height);
  const camera = bundle.camera instanceof THREE.PerspectiveCamera
    ? bundle.camera
    : new THREE.PerspectiveCamera(42, aspect, 1, 5000);
  bundle.camera = camera;
  camera.aspect = aspect;
  applyTerrainCameraSettings(camera, settings, terrainCameraOverride);

  const seed = hashSeed(settings.seed);
  const useSvgNoiseField = settings.source === 'svg' && shouldUseNoiseInsideSvg(settings);
  const threshold = isMaskedSource(settings)
    ? (useSvgNoiseField ? 0.26 : 0.5)
    : 0.38 - settings.nodeDensity * 0.16;
  const weights = new Float32Array(pool.nodes.length);
  const active = new Uint8Array(pool.nodes.length);
  const linePositions: number[] = [];
  const lineColors: number[] = [];
  const pathPositions: number[] = [];
  const pathColors: number[] = [];
  const pointPositions: number[] = [];
  const pointColors: number[] = [];
  const pathPointPositions: number[] = [];
  const pathPointColors: number[] = [];

  for (const node of pool.nodes) {
    const weight = terrainWeight(seed, node.x, node.y, settings, mask, phase);
    weights[node.id] = weight;
    active[node.id] = weight > threshold && node.gate < 0.2 + weight * 0.9 ? 1 : 0;
    if (active[node.id]) {
      const point = terrainPoint(seed, node.x, node.y, settings, mask, phase);
      pointPositions.push(point.x, point.y, point.z);
      pointColors.push(...terrainColor(settings, node.x, node.y, point.weight, settings.terrainGlow * 0.25));
    }
  }

  for (const edge of pool.edges) {
    if (pool.pathEdges.has(edge.id)) continue;
    if (!active[edge.a.id] || !active[edge.b.id]) continue;
    const midpointX = (edge.a.x + edge.b.x) * 0.5;
    const midpointY = (edge.a.y + edge.b.y) * 0.5;
    const midpointWeight = terrainWeight(seed, midpointX, midpointY, settings, mask, phase);
    if (midpointWeight < (isMaskedSource(settings) ? (useSvgNoiseField ? 0.24 : 0.5) : 0.22)) continue;
    if (edge.gate >= 0.16 + settings.connectionDensity * 0.46 + edge.angle * settings.angleBias * 0.24) continue;
    pushTerrainPolyline(linePositions, lineColors, seed, edge.a, edge.b, settings, mask, phase, settings.organicity * 1.2, settings.terrainGlow * 0.1);
  }

  for (const connection of pool.pathConnections) {
    pushTerrainPolyline(pathPositions, pathColors, seed, connection.a, connection.b, settings, mask, phase, settings.organicity * 0.9, 0.55 + settings.terrainGlow * 0.35, settings.pathColor);
  }

  for (const nodeId of pool.pathPointIds) {
    const node = pool.nodes[nodeId];
    if (!node) continue;
    const point = terrainPoint(seed, node.x, node.y, settings, mask, phase);
    pathPointPositions.push(point.x, point.y + 2, point.z);
    pathPointColors.push(...terrainSolidColor(settings.pathColor, point.weight, 0.75));
  }

  const makeLineObject = (positions: number[], colors: number[], opacity: number) => {
    if (!positions.length) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
    const material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
    });
    return new THREE.LineSegments(geometry, material);
  };

  const makePointObject = (positions: number[], colors: number[], size: number, opacity: number) => {
    if (!positions.length) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
    const material = new THREE.PointsMaterial({
      vertexColors: true,
      transparent: true,
      opacity,
      size,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
    });
    return new THREE.Points(geometry, material);
  };

  const objects = [
    makeLineObject(linePositions, lineColors, 0.38 + settings.terrainGlow * 0.28),
    makePointObject(pointPositions, pointColors, Math.max(2.5, settings.nodeSize * 8), 0.6 + settings.terrainGlow * 0.28),
    makeLineObject(pathPositions, pathColors, 0.82),
    makePointObject(pathPointPositions, pathPointColors, Math.max(8, settings.pathThickness * 8), 0.95),
  ].filter(Boolean) as THREE.Object3D[];

  for (const object of objects) bundle.scene.add(object);
  bundle.renderer.render(bundle.scene, camera);
}

function renderActiveWebgl(
  bundle: GlBundle,
  pool: PatternPool,
  settings: NoiseSettings,
  mask: FieldMask | null,
  phase = 0,
  frameCacheRef?: FrameGeometryCacheRef,
  terrainCameraOverride?: TerrainCameraOverride | null,
) {
  if (settings.renderMode === 'terrain') {
    renderTerrainWebgl(bundle, pool, settings, mask, phase, terrainCameraOverride);
    return;
  }
  renderWebgl(bundle, pool, settings, mask, phase, frameCacheRef);
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

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load SVG image'));
    image.src = src;
  });
}

async function loadSvgText(src: string) {
  const response = await fetch(src);
  return response.text();
}

function imageDataToMask(context: CanvasRenderingContext2D, width: number, height: number): FieldMask {
  return {
    width,
    height,
    pixels: context.getImageData(0, 0, width, height).data,
  };
}

async function createSvg2dMask(settings: NoiseSettings): Promise<FieldMask | null> {
  if (settings.source !== 'svg' || !settings.svgDataUrl) return null;
  const image = await loadImage(settings.svgDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = settings.width;
  canvas.height = settings.height;
  const context = canvas.getContext('2d');
  if (!context) return null;

  const sourceWidth = image.naturalWidth || settings.width;
  const sourceHeight = image.naturalHeight || settings.height;
  const fit = Math.min(settings.width / sourceWidth, settings.height / sourceHeight) * 0.55 * settings.svgScale;
  const drawWidth = sourceWidth * fit;
  const drawHeight = sourceHeight * fit;
  const centerX = settings.width * 0.5 + settings.svgPositionX * settings.width * 0.5;
  const centerY = settings.height * 0.5 + settings.svgPositionY * settings.height * 0.5;

  context.clearRect(0, 0, settings.width, settings.height);
  context.drawImage(image, centerX - drawWidth * 0.5, centerY - drawHeight * 0.5, drawWidth, drawHeight);
  context.globalCompositeOperation = 'source-in';
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, settings.width, settings.height);
  context.globalCompositeOperation = 'destination-over';
  context.fillStyle = '#000000';
  context.fillRect(0, 0, settings.width, settings.height);
  context.globalCompositeOperation = 'source-over';

  return imageDataToMask(context, settings.width, settings.height);
}

function svg3dMaskKey(settings: NoiseSettings) {
  return JSON.stringify({
    svgDataUrl: settings.svgDataUrl,
    width: settings.width,
    height: settings.height,
    scale: settings.svgScale,
    positionX: settings.svgPositionX,
    positionY: settings.svgPositionY,
    extrude: settings.svgExtrude,
  });
}

function disposeSvg3dMaskCache() {
  if (!svg3dMaskCache) return;
  svg3dMaskCache.group.traverse((object) => {
    if ('geometry' in object && object.geometry instanceof THREE.BufferGeometry) object.geometry.dispose();
  });
  svg3dMaskCache.material.dispose();
  svg3dMaskCache.renderer.dispose();
  svg3dMaskCache = null;
}

function disposeVideoMaskCache() {
  if (!videoMaskCache) return;
  videoMaskCache.video.pause();
  videoMaskCache.video.removeAttribute('src');
  videoMaskCache.video.load();
  videoMaskCache = null;
}

function disposeImageMaskCache() {
  imageMaskCache = null;
}

async function getSvg3dMaskCache(settings: NoiseSettings): Promise<Svg3dMaskCache | null> {
  if (!settings.svgDataUrl) return null;
  const key = svg3dMaskKey(settings);
  if (svg3dMaskCache?.key === key) return svg3dMaskCache;

  disposeSvg3dMaskCache();

  const svgText = await loadSvgText(settings.svgDataUrl);
  const loader = new SVGLoader();
  const svg = loader.parse(svgText);
  const group = new THREE.Group();
  const geometryGroup = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });

  for (const path of svg.paths) {
    const shapes = SVGLoader.createShapes(path);
    for (const shape of shapes) {
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: settings.svgExtrude * 160,
        bevelEnabled: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      geometryGroup.add(mesh);
    }
  }

  if (!geometryGroup.children.length) {
    material.dispose();
    return null;
  }

  const sourceBox = new THREE.Box3().setFromObject(geometryGroup);
  const sourceSize = sourceBox.getSize(new THREE.Vector3());
  const sourceCenter = sourceBox.getCenter(new THREE.Vector3());
  geometryGroup.position.sub(sourceCenter);
  group.add(geometryGroup);
  group.scale.y = -1;
  const fit = Math.min(settings.width / Math.max(1, sourceSize.x), settings.height / Math.max(1, sourceSize.y)) * 0.55 * settings.svgScale;
  group.scale.multiplyScalar(fit);
  group.position.x += settings.svgPositionX * settings.width * 0.5;
  group.position.y += settings.svgPositionY * settings.height * -0.5;

  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(1);
  renderer.setSize(settings.width, settings.height, false);
  renderer.setClearColor(0x000000, 1);

  const scene = new THREE.Scene();
  scene.add(group);
  const camera = new THREE.PerspectiveCamera(36, settings.width / settings.height, 0.1, 10000);

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = settings.width;
  maskCanvas.height = settings.height;
  const maskContext = maskCanvas.getContext('2d');
  if (!maskContext) {
    renderer.dispose();
    material.dispose();
    return null;
  }

  svg3dMaskCache = {
    key,
    renderer,
    scene,
    camera,
    group,
    material,
    canvas,
    maskContext,
  };

  return svg3dMaskCache;
}

async function createSvg3dMask(settings: NoiseSettings, phase: number, orbit: SvgOrbit | null): Promise<FieldMask | null> {
  if (settings.source !== 'svg' || settings.svgMode !== '3d' || !settings.svgDataUrl) return null;
  const cache = await getSvg3dMaskCache(settings);
  if (!cache) return null;

  const target = orbit?.target.clone() ?? new THREE.Vector3(0, 0, 0);
  cache.camera.aspect = settings.width / settings.height;
  cache.camera.updateProjectionMatrix();
  cache.camera.position.copy(orbit?.position ?? new THREE.Vector3(0, 0, Math.max(settings.width, settings.height) * 1.6));
  cache.camera.lookAt(target);
  cache.group.rotation.y = settings.motionEnabled && settings.svgAnimate ? phase * Math.PI * 2 : 0;
  cache.renderer.render(cache.scene, cache.camera);

  cache.maskContext.clearRect(0, 0, settings.width, settings.height);
  cache.maskContext.drawImage(cache.canvas, 0, 0);
  return imageDataToMask(cache.maskContext, settings.width, settings.height);
}

async function createSvgMask(settings: NoiseSettings, phase = 0, orbit: SvgOrbit | null = null): Promise<FieldMask | null> {
  if (settings.svgMode === '3d') return createSvg3dMask(settings, phase, orbit);
  return createSvg2dMask(settings);
}

function waitForVideoEvent(video: HTMLVideoElement, eventName: keyof HTMLMediaElementEventMap) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener(eventName, handleEvent);
      video.removeEventListener('error', handleError);
    };
    const handleEvent = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error('Could not load video'));
    };
    video.addEventListener(eventName, handleEvent, { once: true });
    video.addEventListener('error', handleError, { once: true });
  });
}

async function getVideoMaskCache(settings: NoiseSettings): Promise<VideoMaskCache | null> {
  if (!settings.videoDataUrl) return null;
  if (videoMaskCache?.src === settings.videoDataUrl) return videoMaskCache;

  disposeVideoMaskCache();

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = settings.videoDataUrl;
  await waitForVideoEvent(video, 'loadedmetadata');
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    await waitForVideoEvent(video, 'loadeddata');
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;

  videoMaskCache = {
    src: settings.videoDataUrl,
    video,
    canvas,
    context,
  };

  return videoMaskCache;
}

async function seekVideoFrame(video: HTMLVideoElement, phase: number) {
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  if (duration <= 0) return;
  video.pause();
  const target = Math.min(Math.max(0, phase), 0.999999) * duration;
  if (Math.abs(video.currentTime - target) < 1 / 60) return;
  const seeked = waitForVideoEvent(video, 'seeked');
  video.currentTime = Math.min(target, Math.max(0, duration - 0.001));
  await seeked;
}

async function playVideoPreviewFrame(video: HTMLVideoElement) {
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  if (video.paused) {
    try {
      await video.play();
    } catch {
      // Muted autoplay can still be blocked in unusual browser states; the current frame remains usable.
    }
  }
}

async function createVideoMask(settings: NoiseSettings, phase = 0, playback: 'seek' | 'play' = 'seek'): Promise<FieldMask | null> {
  if (settings.source !== 'video' || !settings.videoDataUrl) return null;
  const cache = await getVideoMaskCache(settings);
  if (!cache) return null;

  if (playback === 'play') {
    await playVideoPreviewFrame(cache.video);
  } else {
    await seekVideoFrame(cache.video, phase);
  }

  if (cache.canvas.width !== settings.width) cache.canvas.width = settings.width;
  if (cache.canvas.height !== settings.height) cache.canvas.height = settings.height;

  const sourceWidth = cache.video.videoWidth || settings.width;
  const sourceHeight = cache.video.videoHeight || settings.height;
  const fit = Math.min(settings.width / sourceWidth, settings.height / sourceHeight) * settings.videoScale;
  const drawWidth = sourceWidth * fit;
  const drawHeight = sourceHeight * fit;
  const centerX = settings.width * 0.5 + settings.videoPositionX * settings.width * 0.5;
  const centerY = settings.height * 0.5 + settings.videoPositionY * settings.height * 0.5;

  cache.context.fillStyle = '#000000';
  cache.context.fillRect(0, 0, settings.width, settings.height);
  cache.context.drawImage(cache.video, centerX - drawWidth * 0.5, centerY - drawHeight * 0.5, drawWidth, drawHeight);

  const image = cache.context.getImageData(0, 0, settings.width, settings.height);
  const threshold = Math.round(Math.max(0, Math.min(1, settings.videoThreshold)) * 255);
  for (let index = 0; index < image.data.length; index += 4) {
    const luminance = image.data[index] * 0.2126 + image.data[index + 1] * 0.7152 + image.data[index + 2] * 0.0722;
    const active = settings.videoInvert ? luminance < threshold : luminance >= threshold;
    const value = active ? 255 : 0;
    image.data[index] = value;
    image.data[index + 1] = value;
    image.data[index + 2] = value;
    image.data[index + 3] = 255;
  }
  cache.context.putImageData(image, 0, 0);

  return imageDataToMask(cache.context, settings.width, settings.height);
}

async function getImageMaskCache(settings: NoiseSettings): Promise<ImageMaskCache | null> {
  if (!settings.imageDataUrl) return null;
  if (imageMaskCache?.src === settings.imageDataUrl) return imageMaskCache;

  disposeImageMaskCache();

  const image = await loadImage(settings.imageDataUrl);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;

  imageMaskCache = {
    src: settings.imageDataUrl,
    image,
    canvas,
    context,
  };

  return imageMaskCache;
}

async function createImageMask(settings: NoiseSettings): Promise<FieldMask | null> {
  if (settings.source !== 'image' || !settings.imageDataUrl) return null;
  const cache = await getImageMaskCache(settings);
  if (!cache) return null;

  if (cache.canvas.width !== settings.width) cache.canvas.width = settings.width;
  if (cache.canvas.height !== settings.height) cache.canvas.height = settings.height;

  const sourceWidth = cache.image.naturalWidth || settings.width;
  const sourceHeight = cache.image.naturalHeight || settings.height;
  const fit = Math.min(settings.width / sourceWidth, settings.height / sourceHeight) * settings.videoScale;
  const drawWidth = sourceWidth * fit;
  const drawHeight = sourceHeight * fit;
  const centerX = settings.width * 0.5 + settings.videoPositionX * settings.width * 0.5;
  const centerY = settings.height * 0.5 + settings.videoPositionY * settings.height * 0.5;

  cache.context.fillStyle = '#000000';
  cache.context.fillRect(0, 0, settings.width, settings.height);
  cache.context.drawImage(cache.image, centerX - drawWidth * 0.5, centerY - drawHeight * 0.5, drawWidth, drawHeight);

  const image = cache.context.getImageData(0, 0, settings.width, settings.height);
  const threshold = Math.round(Math.max(0, Math.min(1, settings.videoThreshold)) * 255);
  for (let index = 0; index < image.data.length; index += 4) {
    const luminance = image.data[index] * 0.2126 + image.data[index + 1] * 0.7152 + image.data[index + 2] * 0.0722;
    const active = settings.videoInvert ? luminance < threshold : luminance >= threshold;
    const value = active ? 255 : 0;
    image.data[index] = value;
    image.data[index + 1] = value;
    image.data[index + 2] = value;
    image.data[index + 3] = 255;
  }
  cache.context.putImageData(image, 0, 0);

  return imageDataToMask(cache.context, settings.width, settings.height);
}
async function createSourceMask(settings: NoiseSettings, phase = 0, orbit: SvgOrbit | null = null, videoPlayback: 'seek' | 'play' = 'seek'): Promise<FieldMask | null> {
  if (settings.source === 'svg') return createSvgMask(settings, phase, orbit);
  if (settings.source === 'video') return createVideoMask(settings, phase, videoPlayback);
  if (settings.source === 'image') return createImageMask(settings);
  return null;
}

async function exportLoopVideo(settings: NoiseSettings, orbit: SvgOrbit | null) {
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

  const exportOrbit = cloneOrbit(orbit);
  const mask = await createSourceMask(settings, 0, exportOrbit);
  const pool = buildPatternPool(settings, mask);
  const fps = Math.max(6, Math.min(30, Math.round(settings.frameRate)));
  const duration = Math.max(2, settings.loopDuration);
  const mimeType = preferredVideoMimeType();
  const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
  renderActiveWebgl(bundle, pool, settings, mask, 0);
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
  track?.requestFrame?.();

  await new Promise<void>((resolve) => {
    const startedAt = performance.now();
    let lastFrameAt = 0;
    let rendering = false;

    const renderFrame = async (phase: number) => {
      const dynamicSource = (settings.source === 'svg' && settings.svgMode === '3d' && settings.svgAnimate)
        || settings.source === 'video';
      if (dynamicSource) {
        const frameMask = await createSourceMask(settings, phase, exportOrbit);
        const framePool = buildPatternPool(settings, frameMask);
        renderActiveWebgl(bundle, framePool, settings, frameMask, phase);
      } else {
        renderActiveWebgl(bundle, pool, settings, mask, phase);
      }
      track?.requestFrame?.();
    };

    const tick = (now: number) => {
      const elapsed = now - startedAt;
      const frameInterval = 1000 / fps;
      if (!rendering && (elapsed - lastFrameAt >= frameInterval || lastFrameAt === 0)) {
        lastFrameAt = elapsed;
        rendering = true;
        const phase = Math.min(0.999999, elapsed / (duration * 1000));
        void renderFrame(phase).finally(() => {
          rendering = false;
          if (performance.now() - startedAt >= duration * 1000) {
            resolve();
          }
        });
      }

      if (elapsed < duration * 1000) {
        window.requestAnimationFrame(tick);
      } else if (!rendering) {
        resolve();
      }
    };

    window.requestAnimationFrame(tick);
  });

  recorder.stop();
  await stopped;
  stream.getTracks().forEach((streamTrack) => streamTrack.stop());
  disposeTerrainObjects(bundle.scene);
  bundle.lineMaterial.dispose();
  bundle.pointMaterial.dispose();
  bundle.renderer.dispose();

  const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
  downloadBlob(blob, `truecourse-pattern-${settings.seed.replace(/[^a-z0-9-]/gi, '-')}.${extension}`);
}

type NoiseCanvasProps = {
  settings: NoiseSettings;
  pathEditEnabled?: boolean;
  onPathPointsChange?: Dispatch<SetStateAction<PathWaypoint[]>>;
  onGradientControlChange?: (change: GradientControlChange) => void;
  onTerrainCameraChange?: (change: TerrainCameraControlChange) => void;
};

function gradientHandlePoints(settings: NoiseSettings) {
  const start = {
    x: clamp01(settings.gradientStartX),
    y: clamp01(settings.gradientStartY),
  };
  const end = {
    x: clamp01(settings.gradientEndX),
    y: clamp01(settings.gradientEndY),
  };
  const vector = {
    x: end.x - start.x,
    y: end.y - start.y,
  };
  const stopKeys: GradientControlKey[] = [
    'gradientStop1Position',
    'gradientStop2Position',
    'gradientStop3Position',
    'gradientStop4Position',
    'gradientStop5Position',
    'gradientStop6Position',
  ];
  const stops = settings.gradientStops.map((stop, index) => {
    const position = clamp01(stop.position);
    const isStartStop = index === 0;
    const isEndStop = index === settings.gradientStops.length - 1;
    const handleX = isStartStop ? start.x : isEndStop ? end.x : start.x + vector.x * position;
    const handleY = isStartStop ? start.y : isEndStop ? end.y : start.y + vector.y * position;
    return {
      key: stopKeys[index],
      color: stop.color,
      isStartStop,
      isEndStop,
      x: clamp01(handleX),
      y: clamp01(handleY),
    };
  });
  return { start, end, stops };
}

export function NoiseCanvas({ settings, pathEditEnabled = false, onPathPointsChange, onGradientControlChange, onTerrainCameraChange }: NoiseCanvasProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<GlBundle | null>(null);
  const poolRef = useRef<PatternPool | null>(null);
  const poolCacheRef = useRef<PatternPoolCache | null>(null);
  const frameCacheRef = useRef<FrameGeometryCache | null>(null);
  const orbitRef = useRef<SvgOrbit | null>(null);
  const latestSettingsRef = useRef(settings);
  const terrainCameraChangeRef = useRef(onTerrainCameraChange);
  const terrainCameraOverrideRef = useRef<TerrainCameraOverride | null>(null);
  const terrainControlsRef = useRef<OrbitControls | null>(null);
  const lastVideoNonceRef = useRef(settings.videoExportNonce);
  const [sourceMask, setSourceMask] = useState<FieldMask | null>(null);
  const [orbitRevision, setOrbitRevision] = useState(0);
  const [previewSize, setPreviewSize] = useState<PreviewSize | null>(null);
  const sourceMaskKey = createSourceMaskKey(settings);
  const showGradientEditor = settings.colorMode === 'gradient' && settings.gradientEdit && Boolean(onGradientControlChange);
  const gradientHandles = gradientHandlePoints(settings);

  latestSettingsRef.current = settings;
  terrainCameraChangeRef.current = onTerrainCameraChange;

  const handlePathPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!pathEditEnabled || settings.pathMode !== 'manual' || !settings.pathEnabled || !onPathPointsChange) return;
    const pool = poolRef.current;
    const canvas = canvasRef.current;
    if (!pool?.nodes.length || !canvas) return;

    event.preventDefault();
    const bounds = canvas.getBoundingClientRect();
    const pointerX = event.clientX - bounds.left;
    const pointerY = event.clientY - bounds.top;
    let closest: PoolNode | null = null;

    if (settings.renderMode === 'terrain') {
      const camera = glRef.current?.camera;
      if (!(camera instanceof THREE.PerspectiveCamera)) return;
      const pick = nearestTerrainNodeToPointer(pool, settings, sourceMask, camera, bounds, pointerX, pointerY);
      const screenSnapRadius = Math.max(
        8,
        settings.pathSnapRadius * Math.max(bounds.width / Math.max(1, settings.width), bounds.height / Math.max(1, settings.height)),
      );
      if (!pick.node || pick.distance > screenSnapRadius) return;
      closest = pick.node;
    } else {
      const x = (pointerX / Math.max(1, bounds.width)) * settings.width;
      const y = (pointerY / Math.max(1, bounds.height)) * settings.height;
      closest = nearestNodeToWaypoint(pool.nodes, { x: x / settings.width, y: y / settings.height }, settings);
      if (!closest || Math.hypot(closest.x - x, closest.y - y) > settings.pathSnapRadius) return;
    }

    const waypoint = {
      x: Math.max(0, Math.min(1, closest.x / settings.width)),
      y: Math.max(0, Math.min(1, closest.y / settings.height)),
    };
    const shouldRemove = event.button === 2 || event.altKey || event.shiftKey;

    onPathPointsChange((points) => {
      if (shouldRemove) {
        let removeIndex = -1;
        let removeDistance = Infinity;
        for (let index = 0; index < points.length; index += 1) {
          const distance = Math.hypot(
            points[index].x * settings.width - closest.x,
            points[index].y * settings.height - closest.y,
          );
          if (distance < removeDistance) {
            removeDistance = distance;
            removeIndex = index;
          }
        }
        if (removeIndex === -1 || removeDistance > settings.pathSnapRadius * 1.6) return points;
        return points.filter((_, index) => index !== removeIndex);
      }

      const duplicate = points.some((point) => (
        Math.hypot(point.x * settings.width - closest.x, point.y * settings.height - closest.y) <= settings.pathSnapRadius * 0.8
      ));
      return duplicate ? points : [...points, waypoint];
    });
  };

  const handlePathContextMenu = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    if (!pathEditEnabled || settings.pathMode !== 'manual') return;
    event.preventDefault();
  };

  const updateGradientFromPointer = (stop: ReturnType<typeof gradientHandlePoints>['stops'][number], event: PointerEvent | ReactPointerEvent<HTMLElement>) => {
    if (!onGradientControlChange) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const uv = {
      x: clamp01((event.clientX - bounds.left) / Math.max(1, bounds.width)),
      y: clamp01((event.clientY - bounds.top) / Math.max(1, bounds.height)),
    };

    if (stop.isStartStop) {
      onGradientControlChange({ type: 'gradient-start', x: uv.x, y: uv.y });
      return;
    }

    if (stop.isEndStop) {
      onGradientControlChange({ type: 'gradient-end', x: uv.x, y: uv.y });
      return;
    }

    const start = {
      x: clamp01(settings.gradientStartX),
      y: clamp01(settings.gradientStartY),
    };
    const end = {
      x: clamp01(settings.gradientEndX),
      y: clamp01(settings.gradientEndY),
    };
    const vx = end.x - start.x;
    const vy = end.y - start.y;
    const lengthSq = Math.max(0.0001, vx * vx + vy * vy);
    const nextPosition = ((uv.x - start.x) * vx + (uv.y - start.y) * vy) / lengthSq;
    onGradientControlChange({ type: 'stop-position', key: stop.key, value: clamp01(nextPosition) });
  };

  const handleGradientPointerDown = (stop: ReturnType<typeof gradientHandlePoints>['stops'][number], event: ReactPointerEvent<HTMLElement>) => {
    if (!showGradientEditor) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    updateGradientFromPointer(stop, event);

    const handleMove = (moveEvent: PointerEvent) => updateGradientFromPointer(stop, moveEvent);
    const handleUp = (upEvent: PointerEvent) => {
      target.releasePointerCapture(upEvent.pointerId);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    glRef.current = createGlBundle(canvas);

    return () => {
      if (glRef.current) disposeTerrainObjects(glRef.current.scene);
      glRef.current?.lineMaterial.dispose();
      glRef.current?.pointMaterial.dispose();
      glRef.current?.renderer.dispose();
      disposeSvg3dMaskCache();
      disposeVideoMaskCache();
      disposeImageMaskCache();
      glRef.current = null;
    };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const updatePreviewSize = () => {
      const bounds = stage.getBoundingClientRect();
      const width = Math.max(1, settings.width);
      const height = Math.max(1, settings.height);
      const targetAspect = width / height;
      const containerAspect = bounds.width / Math.max(1, bounds.height);
      const nextSize = containerAspect > targetAspect
        ? {
            width: bounds.height * targetAspect,
            height: bounds.height,
          }
        : {
            width: bounds.width,
            height: bounds.width / targetAspect,
          };

      setPreviewSize((current) => {
        const nextWidth = Math.round(nextSize.width);
        const nextHeight = Math.round(nextSize.height);
        if (current?.width === nextWidth && current.height === nextHeight) return current;
        return { width: nextWidth, height: nextHeight };
      });
    };

    updatePreviewSize();
    const observer = new ResizeObserver(updatePreviewSize);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [settings.height, settings.width]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || settings.renderMode === 'terrain' || settings.source !== 'svg' || settings.svgMode !== '3d') return undefined;

    const camera = new THREE.PerspectiveCamera(36, settings.width / settings.height, 0.1, 10000);
    camera.position.copy(orbitRef.current?.position ?? new THREE.Vector3(0, 0, Math.max(settings.width, settings.height) * 1.6));
    const target = orbitRef.current?.target.clone() ?? new THREE.Vector3(0, 0, 0);
    camera.lookAt(target);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = false;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.target.copy(target);
    controls.update();

    const updateOrbit = () => {
      orbitRef.current = {
        position: camera.position.clone(),
        target: controls.target.clone(),
      };
      setOrbitRevision((value) => value + 1);
    };
    updateOrbit();
    controls.addEventListener('change', updateOrbit);

    return () => {
      controls.removeEventListener('change', updateOrbit);
      controls.dispose();
    };
  }, [settings.height, settings.renderMode, settings.source, settings.svgMode, settings.width]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const bundle = glRef.current;
    if (!canvas || !bundle || settings.renderMode !== 'terrain') return undefined;

    const activeSettings = latestSettingsRef.current;
    const camera = bundle.camera instanceof THREE.PerspectiveCamera
      ? bundle.camera
      : new THREE.PerspectiveCamera(activeSettings.terrainCameraFov, activeSettings.width / activeSettings.height, 1, 5000);
    bundle.camera = camera;
    camera.aspect = activeSettings.width / Math.max(1, activeSettings.height);
    const cameraOverride = terrainCameraOverrideRef.current;
    const target = applyTerrainCameraSettings(camera, activeSettings, cameraOverride);

    const controls = new OrbitControls(camera, canvas);
    terrainControlsRef.current = controls;
    controls.enableDamping = false;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.target.copy(target);
    controls.update();

    const updateField = (key: TerrainCameraControlKey, value: number, current: number) => {
      if (Math.abs(value - current) <= 0.002) return;
      terrainCameraChangeRef.current?.({ key, value });
    };

    let renderFrame = 0;
    const syncLiveCameraOverride = () => {
      terrainCameraOverrideRef.current = {
        position: camera.position.clone(),
        target: controls.target.clone(),
        fov: camera.fov,
      };
    };

    const renderCameraChange = () => {
      syncLiveCameraOverride();
      if (renderFrame) return;
      renderFrame = window.requestAnimationFrame(() => {
        renderFrame = 0;
        bundle.renderer.clear();
        bundle.renderer.render(bundle.scene, camera);
      });
    };

    const updateCameraControls = () => {
      syncLiveCameraOverride();
      const currentSettings = latestSettingsRef.current;
      const values = terrainCameraValueFromWorld(currentSettings, camera.position, controls.target);
      updateField('positionX', values.positionX, currentSettings.terrainCameraPositionX);
      updateField('positionY', values.positionY, currentSettings.terrainCameraPositionY);
      updateField('positionZ', values.positionZ, currentSettings.terrainCameraPositionZ);
      updateField('targetX', values.targetX, currentSettings.terrainCameraTargetX);
      updateField('targetY', values.targetY, currentSettings.terrainCameraTargetY);
      updateField('targetZ', values.targetZ, currentSettings.terrainCameraTargetZ);
    };

    controls.addEventListener('change', renderCameraChange);
    controls.addEventListener('end', updateCameraControls);
    return () => {
      window.cancelAnimationFrame(renderFrame);
      controls.removeEventListener('change', renderCameraChange);
      controls.removeEventListener('end', updateCameraControls);
      if (terrainControlsRef.current === controls) terrainControlsRef.current = null;
      controls.dispose();
    };
  }, [settings.height, settings.renderMode, settings.width]);

  useEffect(() => {
    const controls = terrainControlsRef.current;
    const bundle = glRef.current;
    if (!controls || !bundle || settings.renderMode !== 'terrain') return;
    const camera = bundle.camera;
    if (!(camera instanceof THREE.PerspectiveCamera)) return;

    const cameraOverride = terrainCameraOverrideRef.current;
    if (cameraOverride) {
      if (terrainCameraOverrideMatchesSettings(settings, cameraOverride)) {
        terrainCameraOverrideRef.current = null;
      }
      return;
    }

    camera.aspect = settings.width / Math.max(1, settings.height);
    const target = applyTerrainCameraSettings(camera, settings);
    controls.target.copy(target);
    controls.update();
  }, [settings]);

  useEffect(() => {
    let cancelled = false;
    const maskSettings = latestSettingsRef.current;
    const hasSourceFile = (maskSettings.source === 'svg' && maskSettings.svgDataUrl) || (maskSettings.source === 'video' && maskSettings.videoDataUrl) || (maskSettings.source === 'image' && maskSettings.imageDataUrl);
    if (!isMaskedSource(maskSettings) || !hasSourceFile) {
      disposeSvg3dMaskCache();
      disposeVideoMaskCache();
      disposeImageMaskCache();
      setSourceMask(null);
      return () => {
        cancelled = true;
      };
    }
    if (maskSettings.svgMode !== '3d') disposeSvg3dMaskCache();
    if (maskSettings.source !== 'video') disposeVideoMaskCache();
    if (maskSettings.source !== 'image') disposeImageMaskCache();

    const videoPlayback = maskSettings.source === 'video' && maskSettings.motionEnabled ? 'play' : 'seek';
    void createSourceMask(maskSettings, 0, orbitRef.current, videoPlayback).then((mask) => {
      if (!cancelled) setSourceMask(mask);
    });

    return () => {
      cancelled = true;
    };
  }, [orbitRevision, sourceMaskKey]);

  useEffect(() => {
    const bundle = glRef.current;
    if (!bundle) return;
    const overlayCanvas = overlayRef.current;
    const animatedSvg3d = settings.source === 'svg' && settings.svgMode === '3d' && settings.motionEnabled && settings.svgAnimate;
    const animatedVideo = settings.source === 'video' && settings.motionEnabled;
    const dynamicSourceMask = animatedSvg3d || animatedVideo;
    let cancelled = false;
    let renderingDynamicMask = false;

    if (dynamicSourceMask) {
      const stableVideoPool = animatedVideo ? getCachedPatternPool(poolCacheRef, settings, null) : null;
      if (stableVideoPool) poolRef.current = stableVideoPool;
      let animationId = 0;
      let lastFrameAt = 0;

      const renderPhase = async (phase: number) => {
        if (renderingDynamicMask) return;
        renderingDynamicMask = true;
        const mask = await createSourceMask(settings, phase, orbitRef.current, animatedVideo ? 'play' : 'seek');
        if (!cancelled) {
          const pool = stableVideoPool ?? getCachedPatternPool(poolCacheRef, settings, mask);
          poolRef.current = pool;
          renderActiveWebgl(bundle, pool, settings, mask, phase, frameCacheRef, terrainCameraOverrideRef.current);
          drawNoiseMapOverlay(overlayCanvas, settings, hashSeed(settings.seed), phase, mask);
        }
        renderingDynamicMask = false;
      };

      const tick = (now: number) => {
        const frameInterval = 1000 / Math.max(1, settings.frameRate);
        if (now - lastFrameAt >= frameInterval) {
          lastFrameAt = now;
          const phase = ((now / 1000) % settings.loopDuration) / settings.loopDuration;
          void renderPhase(phase);
        }
        animationId = window.requestAnimationFrame(tick);
      };

      void renderPhase(0);
      animationId = window.requestAnimationFrame(tick);

      return () => {
        cancelled = true;
        window.cancelAnimationFrame(animationId);
        if (animatedVideo) videoMaskCache?.video.pause();
        drawNoiseMapOverlay(overlayCanvas, { ...settings, showMap: false }, hashSeed(settings.seed), 0, sourceMask);
      };
    }

    const pool = getCachedPatternPool(poolCacheRef, settings, sourceMask);
    poolRef.current = pool;
    let animationId = 0;
    let lastFrameAt = 0;

    const tick = (now: number) => {
      const frameInterval = 1000 / Math.max(1, settings.frameRate);
      if (now - lastFrameAt >= frameInterval) {
        lastFrameAt = now;
        const phase = ((now / 1000) % settings.loopDuration) / settings.loopDuration;
        renderActiveWebgl(bundle, pool, settings, sourceMask, phase, frameCacheRef, terrainCameraOverrideRef.current);
        drawNoiseMapOverlay(overlayCanvas, settings, hashSeed(settings.seed), phase, sourceMask);
      }
      animationId = window.requestAnimationFrame(tick);
    };

    renderActiveWebgl(bundle, pool, settings, sourceMask, 0, frameCacheRef, terrainCameraOverrideRef.current);
    drawNoiseMapOverlay(overlayCanvas, settings, hashSeed(settings.seed), 0, sourceMask);
    if (settings.motionEnabled) animationId = window.requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationId);
      drawNoiseMapOverlay(overlayCanvas, { ...settings, showMap: false }, hashSeed(settings.seed), 0, sourceMask);
    };
  }, [settings, sourceMask]);

  useEffect(() => {
    if (settings.videoExportNonce === lastVideoNonceRef.current) return;
    lastVideoNonceRef.current = settings.videoExportNonce;
    void exportLoopVideo(settings, cloneOrbit(orbitRef.current));
  }, [settings]);

  return (
    <div ref={stageRef} className="preview-stage">
      <div
        className="preview-frame"
        style={previewSize ? { width: `${previewSize.width}px`, height: `${previewSize.height}px` } : undefined}
      >
        <canvas
          ref={canvasRef}
          className="pattern-canvas lab-canvas noise-canvas"
          aria-label="Weighted network preview"
          onPointerDown={handlePathPointerDown}
          onContextMenu={handlePathContextMenu}
          style={pathEditEnabled && settings.pathMode === 'manual' ? { cursor: 'crosshair' } : undefined}
        />
        <canvas ref={overlayRef} className="noise-map-canvas" aria-hidden="true" hidden />
        {showGradientEditor ? (
          <div className="gradient-editor" aria-label="Gradient editor">
            <svg className="gradient-axis" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <line
                x1={gradientHandles.start.x * 100}
                y1={gradientHandles.start.y * 100}
                x2={gradientHandles.end.x * 100}
                y2={gradientHandles.end.y * 100}
              />
            </svg>
            {gradientHandles.stops.map((stop, index) => (
              <button
                key={stop.key}
                type="button"
                className={`gradient-handle gradient-stop-handle${stop.isStartStop || stop.isEndStop ? ' gradient-endpoint-stop' : ''}`}
                style={{
                  left: `${stop.x * 100}%`,
                  top: `${stop.y * 100}%`,
                  backgroundColor: stop.color,
                }}
                title={stop.isStartStop ? `Gradient stop ${index + 1} start` : stop.isEndStop ? `Gradient stop ${index + 1} end` : `Gradient stop ${index + 1}`}
                onPointerDown={(event) => handleGradientPointerDown(stop, event)}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
