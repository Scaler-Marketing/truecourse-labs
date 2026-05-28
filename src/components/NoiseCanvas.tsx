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
  transparentBackground: boolean;
  width: number;
  height: number;
};

type NodePoint = {
  id: number;
  x: number;
  y: number;
  weight: number;
};

type Stub = {
  a: NodePoint;
  b: { x: number; y: number };
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

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((part) => part + part).join('') : clean;
  const value = Number.parseInt(full.slice(0, 6), 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function colorWithAlpha(hex: string, alpha: number) {
  const rgb = hexToRgb(hex);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function sampleNoise(seed: number, x: number, y: number, settings: NoiseSettings) {
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

function angleScore(a: NodePoint, b: NodePoint) {
  const angle = Math.abs(Math.atan2(b.y - a.y, b.x - a.x));
  const step = Math.PI / 4;
  const snapped = Math.round(angle / step) * step;
  const delta = Math.abs(angle - snapped);
  return 1 - Math.min(1, delta / (Math.PI / 8));
}

function directionBucket(a: NodePoint, b: NodePoint) {
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const full = Math.PI * 2;
  return ((Math.round(((angle + full) % full) / (Math.PI / 4)) % 8) + 8) % 8;
}

function curveBend(a: { x: number; y: number }, b: { x: number; y: number }, amount: number) {
  if (amount <= 0.01) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length < 4) return null;
  const hash = Math.sin(a.x * 12.9898 + a.y * 78.233 + b.x * 37.719 + b.y * 19.19) * 43758.5453;
  const signed = (hash - Math.floor(hash)) * 2 - 1;
  const bend = signed * amount * Math.min(10, length * 0.22);
  return {
    x: (a.x + b.x) * 0.5 + (-dy / length) * bend,
    y: (a.y + b.y) * 0.5 + (dx / length) * bend,
  };
}

function drawConnection(
  context: CanvasRenderingContext2D,
  a: { x: number; y: number },
  b: { x: number; y: number },
  organicity: number,
) {
  const control = curveBend(a, b, organicity);
  context.beginPath();
  context.moveTo(a.x, a.y);
  if (control) {
    context.quadraticCurveTo(control.x, control.y, b.x, b.y);
  } else {
    context.lineTo(b.x, b.y);
  }
  context.stroke();
}

function keyFor(x: number, y: number, cell: number) {
  return `${Math.floor(x / cell)}:${Math.floor(y / cell)}`;
}

function buildPattern(settings: NoiseSettings) {
  const seed = hashSeed(settings.seed);
  const random = rng(seed + 17);
  const nodes: NodePoint[] = [];
  const spacing = 18 - settings.nodeDensity * 9;
  const jitter = spacing * (0.16 + settings.organicity * 0.26 - settings.angleBias * 0.06);
  const cell = spacing * 2.4;
  const buckets = new Map<string, number[]>();

  for (let y = spacing * 0.5; y < settings.height; y += spacing) {
    for (let x = spacing * 0.5; x < settings.width; x += spacing) {
      const px = x + (random() - 0.5) * jitter;
      const py = y + (random() - 0.5) * jitter;
      const weight = sampleNoise(seed, px, py, settings);
      const threshold = 0.38 - settings.nodeDensity * 0.16;
      if (weight > threshold && random() < 0.2 + weight * 0.92) {
        const node = { id: nodes.length, x: px, y: py, weight };
        nodes.push(node);
        const key = keyFor(px, py, cell);
        buckets.set(key, [...(buckets.get(key) ?? []), node.id]);
      }
    }
  }

  const nearby = (node: NodePoint, radius: number) => {
    const minX = Math.floor((node.x - radius) / cell);
    const maxX = Math.floor((node.x + radius) / cell);
    const minY = Math.floor((node.y - radius) / cell);
    const maxY = Math.floor((node.y + radius) / cell);
    const found: NodePoint[] = [];
    for (let bx = minX; bx <= maxX; bx += 1) {
      for (let by = minY; by <= maxY; by += 1) {
        for (const id of buckets.get(`${bx}:${by}`) ?? []) {
          if (id !== node.id) found.push(nodes[id]);
        }
      }
    }
    return found;
  };

  const edges: Array<[NodePoint, NodePoint]> = [];
  const stubs: Stub[] = [];
  const used = new Set<string>();
  const radius = spacing * (1.65 + settings.connectionDensity * 1.35);
  const maxEdges = Math.round(1 + settings.connectionDensity * 3);

  for (const node of nodes) {
    const byDirection = new Map<number, { other: NodePoint; d: number; angle: number; score: number }>();
    for (const other of nearby(node, radius)) {
      const dx = other.x - node.x;
      const dy = other.y - node.y;
      const d = Math.hypot(dx, dy);
      const angle = angleScore(node, other);
      if (d <= spacing * 0.72 || d >= radius || angle < 0.58 + settings.angleBias * 0.22) continue;
      const midpointWeight = sampleNoise(seed, (node.x + other.x) * 0.5, (node.y + other.y) * 0.5, settings);
      if (midpointWeight < 0.22) continue;
      const bucket = directionBucket(node, other);
      const score = midpointWeight * 1.4 + angle * settings.angleBias - d / radius;
      const previous = byDirection.get(bucket);
      if (!previous || score > previous.score) byDirection.set(bucket, { other, d, angle, score });
    }

    const candidates = Array.from(byDirection.values())
      .map((other) => {
        const axisBonus = directionBucket(node, other.other) % 2 === 0 ? 0.14 : 0;
        return { ...other, score: other.score + axisBonus };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, maxEdges);

    for (const candidate of candidates) {
      const key = node.id < candidate.other.id ? `${node.id}-${candidate.other.id}` : `${candidate.other.id}-${node.id}`;
      if (used.has(key)) continue;
      if (random() < 0.16 + settings.connectionDensity * 0.46 + candidate.angle * settings.angleBias * 0.24) {
        used.add(key);
        edges.push([node, candidate.other]);
      }
    }
  }

  const stubRandom = rng(seed + 907);
  const stubChance = 0.015 + settings.organicity * 0.075;
  for (const node of nodes) {
    if (stubRandom() > stubChance * (0.5 + node.weight)) continue;
    const angle = Math.round((stubRandom() * Math.PI * 2) / (Math.PI / 4)) * (Math.PI / 4);
    const length = spacing * (0.55 + stubRandom() * (0.65 + settings.organicity * 0.6));
    const bend = (stubRandom() - 0.5) * settings.organicity * 2;
    const b = {
      x: node.x + Math.cos(angle) * length + bend,
      y: node.y + Math.sin(angle) * length - bend,
    };
    if (b.x > 0 && b.x < settings.width && b.y > 0 && b.y < settings.height) {
      stubs.push({ a: node, b });
    }
  }

  return { nodes, edges, stubs };
}

function chooseEndpoints(nodes: NodePoint[], settings: NoiseSettings) {
  if (nodes.length < 2) return null;
  const marginX = settings.width * (0.04 + (1 - settings.pathEndpointSpread) * 0.22);
  const marginY = settings.height * 0.08;
  const candidates = nodes.filter((node) => (
    node.x > marginX
    && node.x < settings.width - marginX
    && node.y > marginY
    && node.y < settings.height - marginY
  ));
  const pool = candidates.length > 2 ? candidates : nodes;
  let best: [NodePoint, NodePoint] = [pool[0], pool[1]];
  let bestScore = -Infinity;
  for (let i = 0; i < pool.length; i += Math.max(1, Math.floor(pool.length / 120))) {
    for (let j = i + 1; j < pool.length; j += Math.max(1, Math.floor(pool.length / 120))) {
      const a = pool[i];
      const b = pool[j];
      const score = Math.hypot(a.x - b.x, a.y - b.y);
      if (score > bestScore) {
        bestScore = score;
        best = [a, b];
      }
    }
  }
  return best;
}

function findPathEdges(pattern: ReturnType<typeof buildPattern>, settings: NoiseSettings) {
  const endpoints = chooseEndpoints(pattern.nodes, settings);
  if (!endpoints) return new Set<number>();
  const [start, end] = endpoints;
  const adjacency = new Map<number, Array<{ to: number; edgeIndex: number; cost: number }>>();
  pattern.edges.forEach(([a, b], edgeIndex) => {
    const cost = Math.hypot(a.x - b.x, a.y - b.y);
    adjacency.set(a.id, [...(adjacency.get(a.id) ?? []), { to: b.id, edgeIndex, cost }]);
    adjacency.set(b.id, [...(adjacency.get(b.id) ?? []), { to: a.id, edgeIndex, cost }]);
  });

  const distances = new Map<number, number>([[start.id, 0]]);
  const previous = new Map<number, { node: number; edgeIndex: number }>();
  const queue = new Set<number>(pattern.nodes.map((node) => node.id));

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

export function NoiseCanvas({ settings }: { settings: NoiseSettings }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = settings.width;
    canvas.height = settings.height;

    const context = canvas.getContext('2d');
    if (!context) return;

    const seed = hashSeed(settings.seed);
    context.clearRect(0, 0, settings.width, settings.height);
    if (!settings.transparentBackground) {
      context.fillStyle = settings.backgroundColor;
      context.fillRect(0, 0, settings.width, settings.height);
    }

    if (settings.showMap) {
      const sampleScale = 3;
      const renderWidth = Math.round(settings.width / sampleScale);
      const renderHeight = Math.round(settings.height / sampleScale);
      const image = context.createImageData(renderWidth, renderHeight);
      for (let y = 0; y < renderHeight; y += 1) {
        for (let x = 0; x < renderWidth; x += 1) {
          const value = sampleNoise(seed, x * sampleScale, y * sampleScale, settings);
          const shade = Math.round(value * 255);
          const index = (y * renderWidth + x) * 4;
          image.data[index] = shade;
          image.data[index + 1] = shade;
          image.data[index + 2] = shade;
          image.data[index + 3] = 255;
        }
      }
      const mapCanvas = document.createElement('canvas');
      mapCanvas.width = renderWidth;
      mapCanvas.height = renderHeight;
      mapCanvas.getContext('2d')?.putImageData(image, 0, 0);
      context.globalAlpha = 0.34;
      context.imageSmoothingEnabled = true;
      context.drawImage(mapCanvas, 0, 0, settings.width, settings.height);
      context.globalAlpha = 1;
    }

    const pattern = buildPattern(settings);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    const pathEdges = settings.pathEnabled ? findPathEdges(pattern, settings) : new Set<number>();

    context.strokeStyle = colorWithAlpha(settings.lineColor, 0.72);
    context.lineWidth = settings.lineWidth;
    pattern.edges.forEach(([a, b], index) => {
      if (pathEdges.has(index)) return;
      drawConnection(context, a, b, settings.organicity);
    });

    context.strokeStyle = colorWithAlpha(settings.lineColor, 0.62);
    context.lineWidth = Math.max(0.1, settings.lineWidth * 0.82);
    for (const stub of pattern.stubs) {
      drawConnection(context, stub.a, stub.b, settings.organicity * 0.8);
    }

    if (pathEdges.size) {
      context.strokeStyle = colorWithAlpha(settings.pathColor, 0.96);
      context.lineWidth = settings.pathThickness;
      context.shadowColor = settings.pathColor;
      context.shadowBlur = settings.pathThickness * 1.8;
      pattern.edges.forEach(([a, b], index) => {
        if (!pathEdges.has(index)) return;
        drawConnection(context, a, b, settings.organicity * 0.55);
      });
      context.shadowBlur = 0;
    }

    context.fillStyle = colorWithAlpha(settings.nodeColor, 0.92);
    for (const node of pattern.nodes) {
      context.beginPath();
      context.arc(node.x, node.y, settings.nodeSize * (0.7 + node.weight * 0.55), 0, Math.PI * 2);
      context.fill();
    }

    context.fillStyle = colorWithAlpha(settings.nodeColor, 0.72);
    for (const stub of pattern.stubs) {
      context.beginPath();
      context.arc(stub.b.x, stub.b.y, Math.max(0.3, settings.nodeSize * 0.62), 0, Math.PI * 2);
      context.fill();
    }
  }, [settings]);

  return (
    <div className="preview-stage">
      <canvas ref={canvasRef} className="pattern-canvas noise-canvas" aria-label="Weighted network preview" />
    </div>
  );
}
