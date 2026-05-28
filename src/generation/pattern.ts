import type { Edge, GeneratedPattern, Node, PatternSettings, Point, UploadedShape } from '../types/pattern';
import { distance, distancePointToSegment, edgeMidpoint } from './geometry';
import { createNoiseField } from './noiseField';
import { createRng, randRange } from './random';
import { pointInsideShape } from './svgShape';

function candidateAllowed(
  point: Point,
  settings: PatternSettings,
  shape: UploadedShape | null,
  field: ReturnType<typeof createNoiseField>,
  rng?: () => number,
) {
  let shapeAllowed = true;
  if (shape && settings.shapeMode !== 'free') {
    const inside = pointInsideShape(shape, point);
    if (settings.shapeMode === 'inside') shapeAllowed = inside;
    if (settings.shapeMode === 'outside') shapeAllowed = !inside;

    if (settings.shapeMode === 'contour') {
      const contourDistance = nearestContourDistance(point, shape.contour);
      shapeAllowed = contourDistance < settings.contourDetectionDistance * 2.4;
    }
  }

  if (!shapeAllowed) return false;
  const active = field.sample(point).active;
  return rng ? rng() < 0.24 + active * 1.1 : active > 0.04;
}

function nearestContourDistance(point: Point, contour: Point[]) {
  if (!contour.length) return Infinity;
  let best = Infinity;
  for (let i = 0; i < contour.length; i += 1) {
    const d = distance(point, contour[i]);
    if (d < best) best = d;
  }
  return best;
}

function inBounds(point: Point, settings: PatternSettings) {
  return point.x >= 0 && point.x <= settings.width && point.y >= 0 && point.y <= settings.height;
}

function createFilamentGraph(settings: PatternSettings, shape: UploadedShape | null, rng: () => number) {
  const { width, height } = settings;
  const field = createNoiseField(settings);
  const areaScale = (width * height) / (1280 * 780);
  const intensity = 0.55 + settings.complexity * 1.35;
  const targetNodes = Math.round((560 + settings.density * 1850 * intensity) * areaScale);
  const clusterCount = Math.round(24 + settings.density * 34 + settings.complexity * 24);
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const used = new Set<string>();
  const degree = new Map<number, number>();
  const spatial = createSpatialIndex(Math.max(16, 30 - settings.complexity * 12));

  const addNode = (point: Point, cluster: number) => {
    const node: Node = {
      id: nodes.length,
      cluster,
      weight: randRange(rng, 0.55, 1.28),
      x: point.x,
      y: point.y,
    };
    nodes.push(node);
    spatial.insert(node);
    return node.id;
  };

  const addEdge = (a: number, b: number, strength: number) => {
    if (a === b) return;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (used.has(key)) return;
    const d = distance(nodes[a], nodes[b]);
    used.add(key);
    edges.push({ id: edges.length, a, b, distance: d, strength });
    degree.set(a, (degree.get(a) ?? 0) + 1);
    degree.set(b, (degree.get(b) ?? 0) + 1);
  };

  const seedPoints: Point[] = [];
  const gridCols = Math.ceil(Math.sqrt(clusterCount * (width / height)));
  const gridRows = Math.ceil(clusterCount / gridCols);

  const findSeedPoint = (cellIndex = seedPoints.length) => {
    const col = cellIndex % gridCols;
    const row = Math.floor(cellIndex / gridCols) % gridRows;
    const cellW = width / gridCols;
    const cellH = height / gridRows;
    let point: Point | null = null;
    let bestScore = -Infinity;
    for (let attempt = 0; attempt < 90; attempt += 1) {
      const candidate = {
        x: randRange(rng, col * cellW, Math.min(width, (col + 1) * cellW)),
        y: randRange(rng, row * cellH, Math.min(height, (row + 1) * cellH)),
      };
      const nearest = seedPoints.reduce((best, existing) => Math.min(best, distance(existing, candidate)), Infinity);
      const spread = Math.min(1, nearest / Math.max(80, settings.clusterScale * 1.2));
      const score = field.sample(candidate).active * 0.42 + spread * 0.66 + rng() * 0.12;
      if (score > bestScore && candidateAllowed(candidate, settings, shape, field)) {
        bestScore = score;
        point = candidate;
      }
    }
    if (point) seedPoints.push(point);
    return point;
  };

  const seeds: Array<{ id: number; angle: number; cluster: number }> = [];
  for (let cluster = 0; cluster < clusterCount; cluster += 1) {
    const point = findSeedPoint(cluster);
    if (!point) continue;
    seeds.push({ id: addNode(point, cluster), angle: rng() * Math.PI * 2, cluster });
  }

  const walkers = [...seeds];
  let guard = 0;
  while (nodes.length < targetNodes && guard < targetNodes * 16) {
    if (walkers.length < Math.max(8, clusterCount * 0.22) && nodes.length < targetNodes * 0.96) {
      const point = findSeedPoint();
      if (point) {
        const cluster = clusterCount + guard;
        walkers.push({ id: addNode(point, cluster), angle: rng() * Math.PI * 2, cluster });
      }
    }
    if (!walkers.length) break;

    guard += 1;
    const walkerIndex = Math.floor(rng() * walkers.length);
    const walker = walkers[walkerIndex];
    const current = nodes[walker.id];
    const axis = Math.PI / 4;
    const quantized = Math.round(walker.angle / axis) * axis;
    const angle = quantized + randRange(rng, -0.28, 0.28) * settings.noise;
    const step = randRange(rng, 6.5, 13.5) * randRange(rng, 0.75, 1.25);
    const bend = Math.sin(current.x * 0.012 + current.y * 0.009 + guard * 0.03) * settings.noise * 2.4;
    const next = {
      x: current.x + Math.cos(angle) * step + bend,
      y: current.y + Math.sin(angle) * step - bend * 0.45,
    };

    const fieldValue = field.sample(next).active;
    if (!inBounds(next, settings) || !candidateAllowed(next, settings, shape, field, rng)) {
      walker.angle += randRange(rng, -1.8, 1.8);
      if (rng() < 0.28) walkers.splice(walkerIndex, 1);
      continue;
    }

    const nextId = addNode(next, walker.cluster);
    addEdge(walker.id, nextId, 0.76 + fieldValue * 0.42);
    walker.id = nextId;
    walker.angle = angle + randRange(rng, -0.34, 0.34) * settings.noise;

    if (rng() < 0.012 + fieldValue * 0.045 + settings.branching * 0.052 && walkers.length < targetNodes * 0.18) {
      walkers.push({
        id: nextId,
        angle: walker.angle + (rng() < 0.5 ? 1 : -1) * randRange(rng, 0.75, 1.75),
        cluster: walker.cluster,
      });
    }

    if (rng() < 0.003 + settings.density * 0.004 && walkers.length > 12) {
      walkers.splice(walkerIndex, 1);
    }
  }

  addMicroBranches(nodes, addNode, addEdge, settings, shape, field, rng);
  addShortCircuitLinks(nodes, spatial, addEdge, settings, rng);

  return {
    nodes,
    edges: bridgeComponents(nodes, edges, settings, rng),
  };
}

function createSpatialIndex(cellSize: number) {
  const cells = new Map<string, number[]>();
  const key = (x: number, y: number) => `${Math.floor(x / cellSize)}:${Math.floor(y / cellSize)}`;
  return {
    insert(node: Node) {
      const cell = key(node.x, node.y);
      cells.set(cell, [...(cells.get(cell) ?? []), node.id]);
    },
    nearby(point: Point, radius: number, nodes: Node[]) {
      const minX = Math.floor((point.x - radius) / cellSize);
      const maxX = Math.floor((point.x + radius) / cellSize);
      const minY = Math.floor((point.y - radius) / cellSize);
      const maxY = Math.floor((point.y + radius) / cellSize);
      const found: Node[] = [];
      for (let x = minX; x <= maxX; x += 1) {
        for (let y = minY; y <= maxY; y += 1) {
          for (const id of cells.get(`${x}:${y}`) ?? []) {
            const node = nodes[id];
            if (distance(point, node) <= radius) found.push(node);
          }
        }
      }
      return found;
    },
  };
}

function addMicroBranches(
  nodes: Node[],
  addNode: (point: Point, cluster: number) => number,
  addEdge: (a: number, b: number, strength: number) => void,
  settings: PatternSettings,
  shape: UploadedShape | null,
  field: ReturnType<typeof createNoiseField>,
  rng: () => number,
) {
  const branchTotal = Math.round(nodes.length * (0.18 + settings.branching * 0.22 + settings.complexity * 0.2));
  for (let i = 0; i < branchTotal; i += 1) {
    const root = nodes[Math.floor(rng() * nodes.length)];
    const baseAngle = Math.round((rng() * Math.PI * 2) / (Math.PI / 4)) * (Math.PI / 4);
    const steps = Math.floor(randRange(rng, 1, 4 + settings.complexity * 4));
    let cursor = root.id;
    let angle = baseAngle + (rng() < 0.5 ? 1 : -1) * randRange(rng, 0.72, 1.38);
    for (let stepIndex = 0; stepIndex < steps; stepIndex += 1) {
      const current = nodes[cursor];
      const next = {
        x: current.x + Math.cos(angle) * randRange(rng, 5, 11),
        y: current.y + Math.sin(angle) * randRange(rng, 5, 11),
      };
      if (!inBounds(next, settings) || !candidateAllowed(next, settings, shape, field, rng)) break;
      const nextId = addNode(next, root.cluster);
      addEdge(cursor, nextId, 0.78);
      cursor = nextId;
      angle += randRange(rng, -0.48, 0.48) * settings.noise;
    }
  }
}

function addShortCircuitLinks(
  nodes: Node[],
  spatial: ReturnType<typeof createSpatialIndex>,
  addEdge: (a: number, b: number, strength: number) => void,
  settings: PatternSettings,
  rng: () => number,
) {
  const linkRadius = 12 + settings.density * 12 + settings.complexity * 20;
  const linkCount = Math.round(nodes.length * (0.12 + settings.density * 0.1 + settings.complexity * 0.32));
  for (let i = 0; i < linkCount; i += 1) {
    const a = nodes[Math.floor(rng() * nodes.length)];
    const candidates = spatial.nearby(a, linkRadius, nodes)
      .map((node) => ({ node, d: distance(a, node) }))
      .filter(({ node, d }) => node.id !== a.id && d > 4 && node.cluster === a.cluster)
      .sort((left, right) => left.d - right.d)
      .slice(0, Math.round(4 + settings.complexity * 9));
    const picked = candidates[Math.floor(rng() * candidates.length)];
    if (picked && rng() < 0.48 + settings.complexity * 0.4) addEdge(a.id, picked.node.id, 0.46);
  }
}

function bridgeComponents(nodes: Node[], edges: Edge[], settings: PatternSettings, rng: () => number) {
  const result = [...edges];
  const componentOf = () => {
    const components = new Map<number, number>();
    let componentId = 0;
    const adjacency = new Map<number, number[]>();
    for (const edge of result) {
      adjacency.set(edge.a, [...(adjacency.get(edge.a) ?? []), edge.b]);
      adjacency.set(edge.b, [...(adjacency.get(edge.b) ?? []), edge.a]);
    }
    for (const node of nodes) {
      if (components.has(node.id)) continue;
      const stack = [node.id];
      while (stack.length) {
        const current = stack.pop()!;
        if (components.has(current)) continue;
        components.set(current, componentId);
        for (const next of adjacency.get(current) ?? []) stack.push(next);
      }
      componentId += 1;
    }
    return { components, count: componentId };
  };

  let bridgeLimit = 26;
  while (bridgeLimit > 0) {
    bridgeLimit -= 1;
    const { components, count } = componentOf();
    if (count <= 1) break;

    const byComponent = new Map<number, number[]>();
    for (const node of nodes) {
      const component = components.get(node.id) ?? 0;
      byComponent.set(component, [...(byComponent.get(component) ?? []), node.id]);
    }

    const groups = Array.from(byComponent.entries()).sort((a, b) => b[1].length - a[1].length);
    const anchor = groups[0][1].filter((_, index) => index % Math.max(1, Math.floor(groups[0][1].length / 42)) === 0);
    let best: { a: number; b: number; d: number } | null = null;

    for (const [, ids] of groups.slice(1, 18)) {
      const sample = ids.filter((_, index) => index % Math.max(1, Math.floor(ids.length / 12)) === 0);
      for (const a of anchor) {
        for (const b of sample) {
          const d = distance(nodes[a], nodes[b]) * randRange(rng, 0.9, 1.12);
          if (!best || d < best.d) best = { a, b, d };
        }
      }
    }

    if (!best) break;
    const length = distance(nodes[best.a], nodes[best.b]);
    if (length > 90 + settings.clusterScale * 0.28 && rng() > settings.branching * 0.35) break;
    result.push({
      id: result.length,
      a: best.a,
      b: best.b,
      distance: length,
      strength: 0.42,
    });
  }

  return result.map((edge, index) => ({ ...edge, id: index }));
}

function detectContourEdges(nodes: Node[], edges: Edge[], settings: PatternSettings, shape: UploadedShape | null) {
  const edgeIds = new Set<number>();
  const nodeIds = new Set<number>();
  if (!shape?.contour.length) return { edgeIds, nodeIds };

  for (const edge of edges) {
    const a = nodes[edge.a];
    const b = nodes[edge.b];
    const mid = edgeMidpoint(edge, nodes);
    let near = false;
    for (let i = 0; i < shape.contour.length; i += 2) {
      const p = shape.contour[i];
      const d = Math.min(distancePointToSegment(p, a, b), distance(mid, p));
      if (d <= settings.contourDetectionDistance) {
        near = true;
        break;
      }
    }
    if (near) {
      edgeIds.add(edge.id);
      nodeIds.add(edge.a);
      nodeIds.add(edge.b);
    }
  }
  return { edgeIds, nodeIds };
}

function chooseCourseEndpoints(nodes: Node[], settings: PatternSettings, rng: () => number): [number, number] {
  const marginX = settings.width * 0.1;
  const marginY = settings.height * 0.12;
  const candidates = nodes.filter((node) => (
    node.x > marginX
    && node.x < settings.width - marginX
    && node.y > marginY
    && node.y < settings.height - marginY
  ));
  const pool = candidates.length > 24 ? candidates : nodes;
  let best: [number, number] = [pool[0]?.id ?? 0, pool[1]?.id ?? 0];
  let bestScore = -Infinity;
  const sampleCount = Math.min(pool.length, Math.round(22 + settings.startEndRandomness * 38));
  const samples = new Set<number>();
  while (samples.size < sampleCount && samples.size < pool.length) {
    samples.add(Math.floor(rng() * pool.length));
  }

  const sampleArray = Array.from(samples).map((index) => pool[index]);
  for (const a of sampleArray) {
    for (const b of sampleArray) {
      if (a.id === b.id) continue;
      const centralityPenalty = Math.abs(a.y - settings.height * 0.5) * 0.08 + Math.abs(b.y - settings.height * 0.5) * 0.08;
      const score = distance(a, b) * (0.72 + rng() * settings.startEndRandomness) - centralityPenalty;
      if (score > bestScore) {
        bestScore = score;
        best = [a.id, b.id];
      }
    }
  }
  return best;
}

function collectReachableSubgraph(nodes: Node[], edges: Edge[], start: number, maxNodes = 900) {
  const adjacency = new Map<number, number[]>();
  for (const edge of edges) {
    adjacency.set(edge.a, [...(adjacency.get(edge.a) ?? []), edge.b]);
    adjacency.set(edge.b, [...(adjacency.get(edge.b) ?? []), edge.a]);
  }
  const visited = new Set<number>();
  const queue = [start];
  while (queue.length && visited.size < maxNodes) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) queue.push(next);
    }
  }
  return {
    nodes: nodes.filter((node) => visited.has(node.id)),
    edges: edges.filter((edge) => visited.has(edge.a) && visited.has(edge.b)),
  };
}

function findCoursePath(nodes: Node[], edges: Edge[], settings: PatternSettings, start: number, end: number) {
  const adjacency = new Map<number, Array<{ to: number; edgeId: number; cost: number }>>();
  for (const edge of edges) {
    const midpoint = edgeMidpoint(edge, nodes);
    const edgeInsetX = Math.min(midpoint.x, settings.width - midpoint.x) / settings.width;
    const edgeInsetY = Math.min(midpoint.y, settings.height - midpoint.y) / settings.height;
    const boundaryPenalty = Math.max(0, 0.16 - edgeInsetY) * 420 + Math.max(0, 0.06 - edgeInsetX) * 260;
    const cost = edge.distance / Math.max(0.2, edge.strength) + boundaryPenalty;
    adjacency.set(edge.a, [...(adjacency.get(edge.a) ?? []), { to: edge.b, edgeId: edge.id, cost }]);
    adjacency.set(edge.b, [...(adjacency.get(edge.b) ?? []), { to: edge.a, edgeId: edge.id, cost }]);
  }

  const distances = new Map<number, number>([[start, 0]]);
  const previous = new Map<number, { node: number; edgeId: number }>();
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
    if (current === -1 || current === end) break;
    queue.delete(current);

    for (const next of adjacency.get(current) ?? []) {
      if (!queue.has(next.to)) continue;
      const score = best + next.cost;
      if (score < (distances.get(next.to) ?? Infinity)) {
        distances.set(next.to, score);
        previous.set(next.to, { node: current, edgeId: next.edgeId });
      }
    }
  }

  const edgeIds = new Set<number>();
  let cursor = end;
  while (previous.has(cursor)) {
    const step = previous.get(cursor)!;
    edgeIds.add(step.edgeId);
    cursor = step.node;
  }
  return edgeIds;
}

export function generatePattern(settings: PatternSettings, shape: UploadedShape | null): GeneratedPattern {
  const rng = createRng(settings.seed);
  const { nodes, edges } = createFilamentGraph(settings, shape, rng);
  let highlightEdgeIds = new Set<number>();
  if (settings.highlightPath && nodes.length > 1) {
    const [start, initialEnd] = chooseCourseEndpoints(nodes, settings, rng);
    const reachable = collectReachableSubgraph(nodes, edges, start);
    const end = reachable.nodes.some((node) => node.id === initialEnd)
      ? initialEnd
      : chooseCourseEndpoints(reachable.nodes.length > 1 ? reachable.nodes : nodes, settings, rng)[1];
    highlightEdgeIds = findCoursePath(nodes, reachable.edges.length ? reachable.edges : edges, settings, start, end);
  }
  const contour = detectContourEdges(nodes, edges, settings, shape);

  return {
    nodes,
    edges,
    highlightEdgeIds,
    contourEdgeIds: contour.edgeIds,
    contourNodes: contour.nodeIds,
    size: { width: settings.width, height: settings.height },
  };
}
