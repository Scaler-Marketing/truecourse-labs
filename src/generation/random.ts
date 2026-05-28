export function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createRng(seed: string) {
  let state = hashSeed(seed) || 1;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function randRange(rng: () => number, min: number, max: number) {
  return min + rng() * (max - min);
}

export function pick<T>(rng: () => number, items: T[]): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}
