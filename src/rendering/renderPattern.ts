import type { Edge, GeneratedPattern, Node, PatternSettings, Point, UploadedShape } from '../types/pattern';

function scalePoint(point: Point, scale: number) {
  return { x: point.x * scale, y: point.y * scale };
}

function linePath(a: Point, b: Point, smoothness: number) {
  if (smoothness <= 0.02) return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} L ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const bend = Math.sin((a.x + b.y) * 0.021) * smoothness * 9;
  const cx = mx + (-dy / length) * bend;
  const cy = my + (dx / length) * bend;
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

function drawEdge(
  context: CanvasRenderingContext2D,
  edge: Edge,
  nodes: Node[],
  scale: number,
  smoothness = 0,
) {
  const a = scalePoint(nodes[edge.a], scale);
  const b = scalePoint(nodes[edge.b], scale);
  context.beginPath();
  context.moveTo(a.x, a.y);
  if (smoothness > 0.02) {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    const bend = Math.sin((a.x + b.y) * 0.021) * smoothness * 9 * scale;
    context.quadraticCurveTo(mx + (-dy / length) * bend, my + (dx / length) * bend, b.x, b.y);
  } else {
    context.lineTo(b.x, b.y);
  }
  context.stroke();
}

export function renderPatternToCanvas(
  canvas: HTMLCanvasElement,
  pattern: GeneratedPattern,
  settings: PatternSettings,
  shape: UploadedShape | null,
  scale = 1,
) {
  canvas.width = Math.round(pattern.size.width * scale);
  canvas.height = Math.round(pattern.size.height * scale);
  const context = canvas.getContext('2d')!;
  context.clearRect(0, 0, canvas.width, canvas.height);

  if (!settings.transparentBackground) {
    context.fillStyle = settings.backgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';

  if (settings.glowIntensity > 0) {
    context.shadowColor = settings.lineColor;
    context.shadowBlur = settings.glowIntensity * 7 * scale;
  }
  context.strokeStyle = settings.lineColor;
  context.globalAlpha = 0.38;
  context.lineWidth = settings.lineThickness * scale;
  for (const edge of pattern.edges) {
    if (pattern.highlightEdgeIds.has(edge.id) || pattern.contourEdgeIds.has(edge.id)) continue;
    drawEdge(context, edge, pattern.nodes, scale);
  }

  context.globalAlpha = 0.34 + settings.contourVisibilityStrength * 0.5;
  context.strokeStyle = settings.contourHighlightColor;
  context.lineWidth = settings.contourHighlightThickness * scale;
  context.shadowColor = settings.contourHighlightColor;
  context.shadowBlur = settings.contourHighlightGlow * 8 * scale;
  for (const edge of pattern.edges) {
    if (pattern.contourEdgeIds.has(edge.id) && !pattern.highlightEdgeIds.has(edge.id)) {
      drawEdge(context, edge, pattern.nodes, scale, settings.pathSmoothness * 0.35);
    }
  }

  context.globalAlpha = 0.92;
  context.strokeStyle = settings.pathColor;
  context.lineWidth = settings.pathThickness * scale;
  context.shadowColor = settings.pathColor;
  context.shadowBlur = settings.pathGlow * 10 * scale;
  for (const edge of pattern.edges) {
    if (pattern.highlightEdgeIds.has(edge.id)) drawEdge(context, edge, pattern.nodes, scale, settings.pathSmoothness);
  }

  context.globalAlpha = 0.75;
  context.shadowBlur = settings.glowIntensity * 4 * scale;
  const highlightNodes = new Set<number>();
  for (const edge of pattern.edges) {
    if (pattern.highlightEdgeIds.has(edge.id)) {
      highlightNodes.add(edge.a);
      highlightNodes.add(edge.b);
    }
  }

  for (const node of pattern.nodes) {
    const isHighlight = highlightNodes.has(node.id);
    const isContour = pattern.contourNodes.has(node.id);
    context.fillStyle = isHighlight ? settings.pathColor : isContour ? settings.contourHighlightColor : settings.highlightColor;
    context.globalAlpha = isHighlight ? 0.98 : isContour ? 0.68 : 0.48;
    context.beginPath();
    context.arc(node.x * scale, node.y * scale, settings.nodeSize * node.weight * scale, 0, Math.PI * 2);
    context.fill();
  }

  if (shape && settings.showSvgGuide) {
    const image = new Image();
    image.src = shape.guideDataUrl;
    image.onload = () => {
      context.save();
      context.globalAlpha = 0.12;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      context.restore();
    };
  }

  if (shape && settings.maskToShape && settings.shapeMode !== 'outside') {
    context.globalCompositeOperation = 'destination-in';
    context.drawImage(shape.mask, 0, 0, canvas.width, canvas.height);
  }

  context.restore();
}

export function patternToSvg(pattern: GeneratedPattern, settings: PatternSettings, shape: UploadedShape | null) {
  const { width, height } = pattern.size;
  const background = settings.transparentBackground
    ? ''
    : `<rect width="100%" height="100%" fill="${settings.backgroundColor}" />`;
  const maskId = 'tc-shape-mask';
  const mask = shape && settings.maskToShape && settings.shapeMode !== 'outside'
    ? `<defs><mask id="${maskId}"><image href="${shape.guideDataUrl}" width="${width}" height="${height}" /></mask></defs>`
    : '';
  const maskAttr = mask ? ` mask="url(#${maskId})"` : '';

  const baseEdges = pattern.edges
    .filter((edge) => !pattern.highlightEdgeIds.has(edge.id) && !pattern.contourEdgeIds.has(edge.id))
    .map((edge) => `<path d="${linePath(pattern.nodes[edge.a], pattern.nodes[edge.b], 0)}" />`)
    .join('');
  const contourEdges = pattern.edges
    .filter((edge) => pattern.contourEdgeIds.has(edge.id) && !pattern.highlightEdgeIds.has(edge.id))
    .map((edge) => `<path d="${linePath(pattern.nodes[edge.a], pattern.nodes[edge.b], settings.pathSmoothness * 0.35)}" />`)
    .join('');
  const pathEdges = pattern.edges
    .filter((edge) => pattern.highlightEdgeIds.has(edge.id))
    .map((edge) => `<path d="${linePath(pattern.nodes[edge.a], pattern.nodes[edge.b], settings.pathSmoothness)}" />`)
    .join('');
  const nodes = pattern.nodes
    .map((node) => `<circle cx="${node.x.toFixed(2)}" cy="${node.y.toFixed(2)}" r="${(settings.nodeSize * node.weight).toFixed(2)}" />`)
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${mask}
${background}
<g${maskAttr} fill="none" stroke-linecap="round" stroke-linejoin="round">
  <g stroke="${settings.lineColor}" stroke-width="${settings.lineThickness}" opacity="0.38">${baseEdges}</g>
  <g stroke="${settings.contourHighlightColor}" stroke-width="${settings.contourHighlightThickness}" opacity="${(0.34 + settings.contourVisibilityStrength * 0.5).toFixed(2)}">${contourEdges}</g>
  <g stroke="${settings.pathColor}" stroke-width="${settings.pathThickness}" opacity="0.92">${pathEdges}</g>
</g>
<g${maskAttr} fill="${settings.highlightColor}" opacity="0.48">${nodes}</g>
${shape && settings.showSvgGuide ? `<image href="${shape.guideDataUrl}" width="${width}" height="${height}" opacity="0.12" />` : ''}
</svg>`;
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
