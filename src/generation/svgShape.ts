import type { CanvasSize, Point, UploadedShape } from '../types/pattern';

function svgToDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function normalizeSvgSource(source: string, size: CanvasSize) {
  if (source.includes('<svg') && !/viewBox=/i.test(source)) {
    return source.replace('<svg', `<svg viewBox="0 0 ${size.width} ${size.height}"`);
  }
  return source;
}

export async function parseUploadedSvg(file: File, size: CanvasSize): Promise<UploadedShape> {
  const raw = normalizeSvgSource(await file.text(), size);
  const parser = new DOMParser();
  const parsed = parser.parseFromString(raw, 'image/svg+xml');
  const svg = parsed.documentElement;
  const viewBox = svg.getAttribute('viewBox')?.split(/[\s,]+/).map(Number);
  const [vx, vy, vw, vh] = viewBox?.length === 4 ? viewBox : [0, 0, size.width, size.height];
  const sx = size.width / vw;
  const sy = size.height / vh;

  const contour: Point[] = [];
  const elements = Array.from(svg.querySelectorAll('path, polygon, polyline, rect, circle, ellipse, line'));
  const sampler = window.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  sampler.style.position = 'absolute';
  sampler.style.left = '-9999px';
  sampler.style.width = `${size.width}px`;
  sampler.style.height = `${size.height}px`;
  sampler.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`);
  window.document.body.appendChild(sampler);

  for (const element of elements) {
    try {
      const clone = element.cloneNode(true) as SVGGeometryElement;
      sampler.appendChild(clone);
      const length = typeof clone.getTotalLength === 'function' ? clone.getTotalLength() : 0;
      const samples = Math.max(24, Math.min(480, Math.ceil(length / 7)));
      for (let i = 0; i <= samples; i += 1) {
        const p = clone.getPointAtLength((i / samples) * length);
        contour.push({ x: (p.x - vx) * sx, y: (p.y - vy) * sy });
      }
      clone.remove();
    } catch {
      // Some SVG primitives in older browsers are not geometry elements; the mask still handles them.
    }
  }
  sampler.remove();

  const guideDataUrl = svgToDataUrl(raw);
  const image = new Image();
  image.decoding = 'async';
  image.src = guideDataUrl;
  await image.decode();

  const mask = document.createElement('canvas');
  mask.width = size.width;
  mask.height = size.height;
  const context = mask.getContext('2d', { willReadFrequently: true })!;
  context.clearRect(0, 0, size.width, size.height);
  context.drawImage(image, 0, 0, size.width, size.height);

  return {
    source: raw,
    fileName: file.name,
    contour,
    mask,
    guideDataUrl,
  };
}

export function pointInsideShape(shape: UploadedShape | null, point: Point) {
  if (!shape) return true;
  const context = shape.mask.getContext('2d', { willReadFrequently: true });
  if (!context) return true;
  const x = Math.max(0, Math.min(shape.mask.width - 1, Math.round(point.x)));
  const y = Math.max(0, Math.min(shape.mask.height - 1, Math.round(point.y)));
  return context.getImageData(x, y, 1, 1).data[3] > 16;
}
