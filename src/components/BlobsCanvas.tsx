import { useEffect, useRef } from 'react';
import { createRng } from '../generation/random';

const maxBlobLines = 28;

export type BlobsSettings = {
  seed: string;
  lineCount: number;
  lineWidth: number;
  cornerRadius: number;
  angleSpread: number;
  offsetJitter: number;
  backgroundColor: string;
  blobColor: string;
  motionEnabled: boolean;
  loopDuration: number;
  motionAmount: number;
  frameRate: number;
  transparentBackground: boolean;
  videoExportNonce: number;
  width: number;
  height: number;
};

type BlobLine = {
  normalX: number;
  normalY: number;
  offset: number;
  phase: number;
  rotationAmplitude: number;
};

type GlBundle = {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  position: number;
  resolution: WebGLUniformLocation;
  lineCount: WebGLUniformLocation;
  normals: WebGLUniformLocation;
  offsets: WebGLUniformLocation;
  phases: WebGLUniformLocation;
  rotationAmplitudes: WebGLUniformLocation;
  lineWidth: WebGLUniformLocation;
  cornerRadius: WebGLUniformLocation;
  timePhase: WebGLUniformLocation;
  motionAmount: WebGLUniformLocation;
  backgroundColor: WebGLUniformLocation;
  blobColor: WebGLUniformLocation;
  transparentBackground: WebGLUniformLocation;
  quadBuffer: WebGLBuffer;
};

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Could not create shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) ?? 'Unknown shader error';
    gl.deleteShader(shader);
    throw new Error(info);
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, `
    attribute vec2 a_position;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, `
    precision highp float;

    #define MAX_LINES 28

    uniform vec2 u_resolution;
    uniform int u_lineCount;
    uniform vec2 u_normals[MAX_LINES];
    uniform float u_offsets[MAX_LINES];
    uniform float u_phases[MAX_LINES];
    uniform float u_rotationAmplitudes[MAX_LINES];
    uniform float u_lineWidth;
    uniform float u_cornerRadius;
    uniform float u_timePhase;
    uniform float u_motionAmount;
    uniform vec4 u_backgroundColor;
    uniform vec4 u_blobColor;
    uniform float u_transparentBackground;

    float smoothUnion(float a, float b, float k) {
      if (k <= 0.0001) return min(a, b);
      float h = max(k - abs(a - b), 0.0) / k;
      return min(a, b) - h * h * k * 0.25;
    }

    vec2 rotate2(vec2 value, float angle) {
      float c = cos(angle);
      float s = sin(angle);
      return vec2(value.x * c - value.y * s, value.x * s + value.y * c);
    }

    void main() {
      float minSide = min(u_resolution.x, u_resolution.y);
      vec2 p = (gl_FragCoord.xy - u_resolution * 0.5) / minSide;
      float halfWidth = u_lineWidth / minSide * 0.5;
      float radius = u_cornerRadius / minSide;
      float lineSdf = 10.0;
      float phase = u_timePhase * 6.28318530718;
      float cornerBlend = min(radius * 1.65, halfWidth * 4.2);

      for (int i = 0; i < MAX_LINES; i++) {
        if (i < u_lineCount) {
          vec2 normal = rotate2(normalize(u_normals[i]), sin(phase + u_phases[i]) * u_rotationAmplitudes[i] * u_motionAmount);
          float strip = abs(dot(p, normal) - u_offsets[i]) - halfWidth;
          lineSdf = smoothUnion(lineSdf, strip, cornerBlend);
        }
      }

      float aa = max(0.85 / minSide, 0.00045);
      float blobMix = smoothstep(-aa, aa, lineSdf);
      vec4 background = vec4(u_backgroundColor.rgb, u_backgroundColor.a * (1.0 - u_transparentBackground));
      vec4 color = mix(background, u_blobColor, blobMix);
      gl_FragColor = color;
    }
  `);

  const program = gl.createProgram();
  if (!program) throw new Error('Could not create program');
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? 'Could not link program');
  }
  return program;
}

function getUniform(gl: WebGLRenderingContext, program: WebGLProgram, name: string) {
  const uniform = gl.getUniformLocation(program, name);
  if (!uniform) throw new Error(`Missing uniform ${name}`);
  return uniform;
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

function createGlBundle(canvas: HTMLCanvasElement): GlBundle | null {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: true,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true,
  });
  if (!gl) return null;

  const program = createProgram(gl);
  const quadBuffer = gl.createBuffer();
  if (!quadBuffer) return null;
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,
    1, -1,
    -1, 1,
    -1, 1,
    1, -1,
    1, 1,
  ]), gl.STATIC_DRAW);

  return {
    gl,
    program,
    position: gl.getAttribLocation(program, 'a_position'),
    resolution: getUniform(gl, program, 'u_resolution'),
    lineCount: getUniform(gl, program, 'u_lineCount'),
    normals: getUniform(gl, program, 'u_normals'),
    offsets: getUniform(gl, program, 'u_offsets'),
    phases: getUniform(gl, program, 'u_phases'),
    rotationAmplitudes: getUniform(gl, program, 'u_rotationAmplitudes'),
    lineWidth: getUniform(gl, program, 'u_lineWidth'),
    cornerRadius: getUniform(gl, program, 'u_cornerRadius'),
    timePhase: getUniform(gl, program, 'u_timePhase'),
    motionAmount: getUniform(gl, program, 'u_motionAmount'),
    backgroundColor: getUniform(gl, program, 'u_backgroundColor'),
    blobColor: getUniform(gl, program, 'u_blobColor'),
    transparentBackground: getUniform(gl, program, 'u_transparentBackground'),
    quadBuffer,
  };
}

function buildBlobLines(settings: BlobsSettings): BlobLine[] {
  const random = createRng(settings.seed);
  const count = Math.max(1, Math.min(maxBlobLines, Math.round(settings.lineCount)));
  const minSide = Math.min(settings.width, settings.height);
  const aspectX = settings.width / minSide;
  const maxOffset = Math.hypot(aspectX * 0.5, 0.5) * (0.92 + settings.offsetJitter * 0.24);
  const lines: BlobLine[] = [];

  for (let i = 0; i < count; i += 1) {
    const baseAngle = random() * Math.PI;
    const snapped = Math.round(baseAngle / (Math.PI / 4)) * (Math.PI / 4);
    const angle = snapped + (baseAngle - snapped) * settings.angleSpread + (random() - 0.5) * settings.angleSpread * 0.38;
    const normalAngle = angle + Math.PI * 0.5;
    lines.push({
      normalX: Math.cos(normalAngle),
      normalY: Math.sin(normalAngle),
      offset: (random() * 2 - 1) * maxOffset,
      phase: random() * Math.PI * 2,
      rotationAmplitude: (0.025 + random() * 0.12) * (0.45 + settings.offsetJitter),
    });
  }

  return lines;
}

function renderBlobs(bundle: GlBundle, lines: BlobLine[], settings: BlobsSettings, phase = 0) {
  const { gl } = bundle;
  if (gl.canvas.width !== settings.width) gl.canvas.width = settings.width;
  if (gl.canvas.height !== settings.height) gl.canvas.height = settings.height;

  const normals = new Float32Array(maxBlobLines * 2);
  const offsets = new Float32Array(maxBlobLines);
  const phases = new Float32Array(maxBlobLines);
  const rotationAmplitudes = new Float32Array(maxBlobLines);

  lines.forEach((line, index) => {
    normals[index * 2] = line.normalX;
    normals[index * 2 + 1] = line.normalY;
    offsets[index] = line.offset;
    phases[index] = line.phase;
    rotationAmplitudes[index] = line.rotationAmplitude;
  });

  const background = hexToRgba(settings.backgroundColor, 1);
  const blob = hexToRgba(settings.blobColor, 1);

  gl.viewport(0, 0, settings.width, settings.height);
  gl.useProgram(bundle.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, bundle.quadBuffer);
  gl.enableVertexAttribArray(bundle.position);
  gl.vertexAttribPointer(bundle.position, 2, gl.FLOAT, false, 0, 0);
  gl.uniform2f(bundle.resolution, settings.width, settings.height);
  gl.uniform1i(bundle.lineCount, lines.length);
  gl.uniform2fv(bundle.normals, normals);
  gl.uniform1fv(bundle.offsets, offsets);
  gl.uniform1fv(bundle.phases, phases);
  gl.uniform1fv(bundle.rotationAmplitudes, rotationAmplitudes);
  gl.uniform1f(bundle.lineWidth, settings.lineWidth);
  gl.uniform1f(bundle.cornerRadius, settings.cornerRadius);
  gl.uniform1f(bundle.timePhase, phase);
  gl.uniform1f(bundle.motionAmount, settings.motionEnabled ? settings.motionAmount : 0);
  gl.uniform4f(bundle.backgroundColor, background[0], background[1], background[2], background[3]);
  gl.uniform4f(bundle.blobColor, blob[0], blob[1], blob[2], blob[3]);
  gl.uniform1f(bundle.transparentBackground, settings.transparentBackground ? 1 : 0);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
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

async function exportLoopVideo(settings: BlobsSettings) {
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

  const lines = buildBlobLines(settings);
  const fps = Math.max(6, Math.min(30, Math.round(settings.frameRate)));
  const duration = Math.max(2, settings.loopDuration);
  const frameCount = Math.ceil(duration * fps);
  const mimeType = preferredVideoMimeType();
  const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';

  renderBlobs(bundle, lines, settings, 0);
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
  for (let frame = 0; frame < frameCount; frame += 1) {
    renderBlobs(bundle, lines, settings, frame / frameCount);
    track?.requestFrame?.();
    await new Promise((resolve) => window.setTimeout(resolve, 1000 / fps));
  }
  recorder.stop();
  await stopped;
  stream.getTracks().forEach((streamTrack) => streamTrack.stop());

  const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
  downloadBlob(blob, `truecourse-blobs-${settings.seed.replace(/[^a-z0-9-]/gi, '-')}.${extension}`);
}

export function BlobsCanvas({ settings }: { settings: BlobsSettings }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<GlBundle | null>(null);
  const lastVideoNonceRef = useRef(settings.videoExportNonce);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    glRef.current = createGlBundle(canvas);
  }, []);

  useEffect(() => {
    const bundle = glRef.current;
    if (!bundle) return;
    const lines = buildBlobLines(settings);
    let animationId = 0;
    let lastFrameAt = 0;

    const tick = (now: number) => {
      const frameInterval = 1000 / Math.max(1, settings.frameRate);
      if (now - lastFrameAt >= frameInterval) {
        lastFrameAt = now;
        const phase = ((now / 1000) % settings.loopDuration) / settings.loopDuration;
        renderBlobs(bundle, lines, settings, phase);
      }
      animationId = window.requestAnimationFrame(tick);
    };

    renderBlobs(bundle, lines, settings, 0);
    if (settings.motionEnabled) animationId = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(animationId);
  }, [settings]);

  useEffect(() => {
    if (settings.videoExportNonce === lastVideoNonceRef.current) return;
    lastVideoNonceRef.current = settings.videoExportNonce;
    void exportLoopVideo(settings);
  }, [settings]);

  return (
    <div className="preview-stage">
      <canvas ref={canvasRef} className="pattern-canvas lab-canvas blobs-canvas" aria-label="Rounded blob shader preview" />
    </div>
  );
}
