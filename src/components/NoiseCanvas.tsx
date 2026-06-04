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

export type NoiseSettings = {
  seed: string;
  source: 'noise' | 'svg' | 'video';
  svgDataUrl: string | null;
  svgMode: '2d' | '3d';
  svgNoiseEnabled: boolean;
  svgPositionX: number;
  svgPositionY: number;
  svgScale: number;
  svgExtrude: number;
  svgAnimate: boolean;
  videoDataUrl: string | null;
  videoThreshold: number;
  videoInvert: boolean;
  videoPositionX: number;
  videoPositionY: number;
  videoScale: number;
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
  camera: THREE.OrthographicCamera;
  lineMaterial: THREE.ShaderMaterial;
  pointMaterial: THREE.ShaderMaterial;
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
  return settings.source === 'svg' || settings.source === 'video';
}

function sampleSourceField(seed: number, x: number, y: number, settings: NoiseSettings, mask: FieldMask | null, phase = 0) {
  if (settings.source === 'svg') {
    const maskValue = sampleMask(mask, x, y);
    if (!shouldUseNoiseInsideSvg(settings)) return maskValue;
    return maskValue * sampleNoise(seed, x, y, settings, phase);
  }
  if (settings.source === 'video') return sampleMask(mask, x, y);
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
  nodes: PoolNode[],
  adjacency: Map<number, Array<{ to: number; edgeIndex: number; cost: number }>>,
  start: PoolNode,
  end: PoolNode,
) {
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
    const segment = findPathSegment(nodes, adjacency, routeNodes[i - 1], routeNodes[i]);
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

  const lineMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      u_color: { value: new THREE.Vector4(1, 1, 1, 1) },
    },
    vertexShader: `
    attribute float a_alpha;
    varying float v_alpha;
    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      v_alpha = a_alpha;
    }
    `,
    fragmentShader: `
    precision mediump float;
    uniform vec4 u_color;
    varying float v_alpha;
    void main() {
      gl_FragColor = vec4(u_color.rgb, u_color.a * v_alpha);
    }
    `,
  });

  const pointMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      u_color: { value: new THREE.Vector4(1, 1, 1, 1) },
      u_pointSize: { value: 1 },
    },
    vertexShader: `
    attribute float a_alpha;
    uniform float u_pointSize;
    varying float v_alpha;
    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = u_pointSize;
      v_alpha = a_alpha;
    }
    `,
    fragmentShader: `
    precision mediump float;
    uniform vec4 u_color;
    varying float v_alpha;
    void main() {
      vec2 p = gl_PointCoord - 0.5;
      float d = length(p);
      float edge = smoothstep(0.5, 0.32, d);
      gl_FragColor = vec4(u_color.rgb, u_color.a * v_alpha * edge);
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
  material.uniforms.u_color.value.set(color[0], color[1], color[2], color[3]);
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

function buildFrameGeometry(pool: PatternPool, settings: NoiseSettings, phase: number, mask: FieldMask | null) {
  const weights = new Float32Array(pool.nodes.length);
  const active = new Uint8Array(pool.nodes.length);
  const connected = new Uint8Array(pool.nodes.length);
  const useSvgNoiseField = settings.source === 'svg' && shouldUseNoiseInsideSvg(settings);
  const useVideoMask = settings.source === 'video';
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
    const weight = useVideoMask
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
    const midpointWeight = useVideoMask
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
    const stubWeight = useVideoMask
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

function renderWebgl(bundle: GlBundle, pool: PatternPool, settings: NoiseSettings, mask: FieldMask | null, phase = 0) {
  const width = settings.width;
  const height = settings.height;
  bundle.renderer.setSize(width, height, false);
  bundle.camera.left = 0;
  bundle.camera.right = width;
  bundle.camera.top = 0;
  bundle.camera.bottom = height;
  bundle.camera.updateProjectionMatrix();
  const background = hexToRgba(settings.backgroundColor, settings.transparentBackground ? 0 : 1);
  bundle.renderer.setClearColor(new THREE.Color(background[0], background[1], background[2]), background[3]);
  bundle.renderer.clear();

  const frame = buildFrameGeometry(pool, settings, phase, mask);
  drawVertices(bundle, frame.lineVertices, frame.lineAlphas, 'lines', hexToRgba(settings.lineColor, 0.9), settings.lineWidth);
  drawVertices(bundle, frame.stubVertices, frame.stubAlphas, 'lines', hexToRgba(settings.lineColor, 0.72), settings.lineWidth * 0.82);
  drawVertices(bundle, frame.pathVertices, frame.pathAlphas, 'lines', hexToRgba(settings.pathColor, 0.96), settings.pathThickness);
  drawVertices(bundle, frame.pathPointVertices, frame.pathPointAlphas, 'points', hexToRgba(settings.pathColor, 1), Math.max(5.5, settings.pathThickness * 2.6));
  drawVertices(bundle, frame.nodeVertices, frame.nodeAlphas, 'points', hexToRgba(settings.nodeColor, 1), Math.max(1.2, settings.nodeSize * 2.3));
  drawVertices(bundle, frame.stubNodeVertices, frame.stubNodeAlphas, 'points', hexToRgba(settings.nodeColor, 0.88), Math.max(1, settings.nodeSize * 1.45));
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

async function createSourceMask(settings: NoiseSettings, phase = 0, orbit: SvgOrbit | null = null, videoPlayback: 'seek' | 'play' = 'seek'): Promise<FieldMask | null> {
  if (settings.source === 'svg') return createSvgMask(settings, phase, orbit);
  if (settings.source === 'video') return createVideoMask(settings, phase, videoPlayback);
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
  renderWebgl(bundle, pool, settings, mask, 0);
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
        renderWebgl(bundle, framePool, settings, frameMask, phase);
      } else {
        renderWebgl(bundle, pool, settings, mask, phase);
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
};

export function NoiseCanvas({ settings, pathEditEnabled = false, onPathPointsChange }: NoiseCanvasProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<GlBundle | null>(null);
  const poolRef = useRef<PatternPool | null>(null);
  const orbitRef = useRef<SvgOrbit | null>(null);
  const lastVideoNonceRef = useRef(settings.videoExportNonce);
  const [sourceMask, setSourceMask] = useState<FieldMask | null>(null);
  const [orbitRevision, setOrbitRevision] = useState(0);
  const [previewSize, setPreviewSize] = useState<PreviewSize | null>(null);

  const handlePathPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!pathEditEnabled || settings.pathMode !== 'manual' || !settings.pathEnabled || !onPathPointsChange) return;
    const pool = poolRef.current;
    const canvas = canvasRef.current;
    if (!pool?.nodes.length || !canvas) return;

    event.preventDefault();
    const bounds = canvas.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * settings.width;
    const y = ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * settings.height;
    const closest = nearestNodeToWaypoint(pool.nodes, { x: x / settings.width, y: y / settings.height }, settings);
    if (!closest || Math.hypot(closest.x - x, closest.y - y) > settings.pathSnapRadius) return;
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    glRef.current = createGlBundle(canvas);

    return () => {
      glRef.current?.lineMaterial.dispose();
      glRef.current?.pointMaterial.dispose();
      glRef.current?.renderer.dispose();
      disposeSvg3dMaskCache();
      disposeVideoMaskCache();
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
    if (!canvas || settings.source !== 'svg' || settings.svgMode !== '3d') return undefined;

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
  }, [settings.height, settings.source, settings.svgMode, settings.width]);

  useEffect(() => {
    let cancelled = false;
    const hasSourceFile = (settings.source === 'svg' && settings.svgDataUrl) || (settings.source === 'video' && settings.videoDataUrl);
    if (!isMaskedSource(settings) || !hasSourceFile) {
      disposeSvg3dMaskCache();
      disposeVideoMaskCache();
      setSourceMask(null);
      return () => {
        cancelled = true;
      };
    }
    if (settings.svgMode !== '3d') disposeSvg3dMaskCache();
    if (settings.source !== 'video') disposeVideoMaskCache();

    const videoPlayback = settings.source === 'video' && settings.motionEnabled ? 'play' : 'seek';
    void createSourceMask(settings, 0, orbitRef.current, videoPlayback).then((mask) => {
      if (!cancelled) setSourceMask(mask);
    });

    return () => {
      cancelled = true;
    };
  }, [orbitRevision, settings]);

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
      const stableVideoPool = animatedVideo ? buildPatternPool(settings, null) : null;
      if (stableVideoPool) poolRef.current = stableVideoPool;
      let animationId = 0;
      let lastFrameAt = 0;

      const renderPhase = async (phase: number) => {
        if (renderingDynamicMask) return;
        renderingDynamicMask = true;
        const mask = await createSourceMask(settings, phase, orbitRef.current, animatedVideo ? 'play' : 'seek');
        if (!cancelled) {
          const pool = stableVideoPool ?? buildPatternPool(settings, mask);
          poolRef.current = pool;
          renderWebgl(bundle, pool, settings, mask, phase);
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

    const pool = buildPatternPool(settings, sourceMask);
    poolRef.current = pool;
    let animationId = 0;
    let lastFrameAt = 0;

    const tick = (now: number) => {
      const frameInterval = 1000 / Math.max(1, settings.frameRate);
      if (now - lastFrameAt >= frameInterval) {
        lastFrameAt = now;
        const phase = ((now / 1000) % settings.loopDuration) / settings.loopDuration;
        renderWebgl(bundle, pool, settings, sourceMask, phase);
        drawNoiseMapOverlay(overlayCanvas, settings, hashSeed(settings.seed), phase, sourceMask);
      }
      animationId = window.requestAnimationFrame(tick);
    };

    renderWebgl(bundle, pool, settings, sourceMask, 0);
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
      </div>
    </div>
  );
}
