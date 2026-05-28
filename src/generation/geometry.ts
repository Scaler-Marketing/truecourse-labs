import type { Edge, Node, Point } from '../types/pattern';

export function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distancePointToSegment(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return distance(point, a);
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
  return distance(point, { x: a.x + t * dx, y: a.y + t * dy });
}

export function edgeMidpoint(edge: Edge, nodes: Node[]) {
  const a = nodes[edge.a];
  const b = nodes[edge.b];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function farthestNodePair(nodes: Node[], randomness: number, rng: () => number): [number, number] {
  if (nodes.length < 2) return [0, 0];
  const sampleCount = Math.min(nodes.length, Math.round(18 + randomness * 34));
  const samples = new Set<number>();
  while (samples.size < sampleCount) {
    samples.add(Math.floor(rng() * nodes.length));
  }

  let best: [number, number] = [0, 1];
  let bestScore = -Infinity;
  const sampleArray = Array.from(samples);
  for (const a of sampleArray) {
    for (const b of sampleArray) {
      if (a === b) continue;
      const score = distance(nodes[a], nodes[b]) * (0.75 + rng() * randomness);
      if (score > bestScore) {
        bestScore = score;
        best = [a, b];
      }
    }
  }
  return best;
}

export function findShortestPath(nodes: Node[], edges: Edge[], start: number, end: number) {
  const adjacency = new Map<number, Array<{ to: number; edgeId: number; cost: number }>>();
  for (const edge of edges) {
    const cost = edge.distance / Math.max(0.2, edge.strength);
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
