import type { PatternSettings, Point } from '../types/pattern';
import { hashSeed } from './random';

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

export function createNoiseField(settings: PatternSettings) {
  const seed = hashSeed(`${settings.seed}:field`);
  const largeScale = 1 / (120 + settings.fieldScale * 360);
  const mediumScale = largeScale * 2.45;
  const fineScale = largeScale * 5.2;

  const sample = (point: Point) => {
    const large = valueNoise(seed, point.x * largeScale, point.y * largeScale);
    const medium = valueNoise(seed + 1013, point.x * mediumScale + 17, point.y * mediumScale - 9);
    const fine = valueNoise(seed + 7919, point.x * fineScale - 3, point.y * fineScale + 29);
    const value = large * 0.62 + medium * 0.28 + fine * 0.1;
    const contrast = Math.max(0, Math.min(1, (value - settings.fieldThreshold) / Math.max(0.08, 0.86 - settings.fieldThreshold)));
    return {
      raw: value,
      active: contrast,
    };
  };

  return { sample };
}
