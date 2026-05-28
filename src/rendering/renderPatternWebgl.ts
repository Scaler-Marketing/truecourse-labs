import type { GeneratedPattern, PatternSettings } from '../types/pattern';

type GlProgram = {
  program: WebGLProgram;
  position: number;
  color: WebGLUniformLocation;
  resolution: WebGLUniformLocation;
  pointSize: WebGLUniformLocation;
};

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext): GlProgram | null {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, `
    attribute vec2 a_position;
    uniform vec2 u_resolution;
    uniform float u_pointSize;
    void main() {
      vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
      gl_Position = vec4(clip * vec2(1.0, -1.0), 0.0, 1.0);
      gl_PointSize = u_pointSize;
    }
  `);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, `
    precision mediump float;
    uniform vec4 u_color;
    void main() {
      gl_FragColor = u_color;
    }
  `);
  if (!vertex || !fragment) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;

  const color = gl.getUniformLocation(program, 'u_color');
  const resolution = gl.getUniformLocation(program, 'u_resolution');
  const pointSize = gl.getUniformLocation(program, 'u_pointSize');
  if (!color || !resolution || !pointSize) return null;

  return {
    program,
    position: gl.getAttribLocation(program, 'a_position'),
    color,
    resolution,
    pointSize,
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

function draw(gl: WebGLRenderingContext, program: GlProgram, vertices: number[], mode: number, color: readonly number[], pointSize = 1) {
  if (!vertices.length) return;
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STREAM_DRAW);
  gl.useProgram(program.program);
  gl.enableVertexAttribArray(program.position);
  gl.vertexAttribPointer(program.position, 2, gl.FLOAT, false, 0, 0);
  gl.uniform4f(program.color, color[0], color[1], color[2], color[3]);
  gl.uniform1f(program.pointSize, pointSize);
  gl.drawArrays(mode, 0, vertices.length / 2);
  gl.deleteBuffer(buffer);
}

export function renderPatternToWebgl(
  canvas: HTMLCanvasElement,
  pattern: GeneratedPattern,
  settings: PatternSettings,
  scale = 1,
) {
  const width = Math.round(pattern.size.width * scale);
  const height = Math.round(pattern.size.height * scale);
  canvas.width = width;
  canvas.height = height;

  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: true,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true,
  });
  if (!gl) return false;

  const program = createProgram(gl);
  if (!program) return false;

  const bg = hexToRgba(settings.backgroundColor, settings.transparentBackground ? 0 : 1);
  gl.viewport(0, 0, width, height);
  gl.clearColor(bg[0], bg[1], bg[2], bg[3]);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(program.program);
  gl.uniform2f(program.resolution, width, height);

  const baseLines: number[] = [];
  const contourLines: number[] = [];
  const pathLines: number[] = [];

  for (const edge of pattern.edges) {
    const a = pattern.nodes[edge.a];
    const b = pattern.nodes[edge.b];
    const target = pattern.highlightEdgeIds.has(edge.id)
      ? pathLines
      : pattern.contourEdgeIds.has(edge.id)
        ? contourLines
        : baseLines;
    target.push(a.x * scale, a.y * scale, b.x * scale, b.y * scale);
  }

  const nodePoints: number[] = [];
  for (const node of pattern.nodes) {
    nodePoints.push(node.x * scale, node.y * scale);
  }

  gl.lineWidth(Math.max(1, settings.lineThickness * scale));
  draw(gl, program, baseLines, gl.LINES, hexToRgba(settings.lineColor, 0.46), 1);
  gl.lineWidth(Math.max(1, settings.contourHighlightThickness * scale));
  draw(gl, program, contourLines, gl.LINES, hexToRgba(settings.contourHighlightColor, 0.72), 1);
  gl.lineWidth(Math.max(1, settings.pathThickness * scale));
  draw(gl, program, pathLines, gl.LINES, hexToRgba(settings.pathColor, 0.95), 1);
  draw(gl, program, nodePoints, gl.POINTS, hexToRgba(settings.highlightColor, 0.62), Math.max(1, settings.nodeSize * 1.65 * scale));

  return true;
}
