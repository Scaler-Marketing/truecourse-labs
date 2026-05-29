import { useEffect, useRef } from 'react';
import * as THREE from 'three';
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
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  material: THREE.ShaderMaterial;
  quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
};

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
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setPixelRatio(1);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
  const material = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      u_resolution: { value: new THREE.Vector2(1, 1) },
      u_lineCount: { value: 0 },
      u_normals: { value: Array.from({ length: maxBlobLines }, () => new THREE.Vector2()) },
      u_offsets: { value: new Float32Array(maxBlobLines) },
      u_phases: { value: new Float32Array(maxBlobLines) },
      u_rotationAmplitudes: { value: new Float32Array(maxBlobLines) },
      u_lineWidth: { value: 1 },
      u_cornerRadius: { value: 1 },
      u_timePhase: { value: 0 },
      u_motionAmount: { value: 0 },
      u_backgroundColor: { value: new THREE.Vector4(0, 0, 0, 1) },
      u_blobColor: { value: new THREE.Vector4(1, 1, 1, 1) },
      u_transparentBackground: { value: 0 },
    },
    vertexShader: `
      void main() {
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
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
    `,
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  scene.add(quad);

  return {
    renderer,
    scene,
    camera,
    material,
    quad,
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
  const offsets = new Float32Array(maxBlobLines);
  const phases = new Float32Array(maxBlobLines);
  const rotationAmplitudes = new Float32Array(maxBlobLines);
  const normals = bundle.material.uniforms.u_normals.value as THREE.Vector2[];

  lines.forEach((line, index) => {
    normals[index].set(line.normalX, line.normalY);
    offsets[index] = line.offset;
    phases[index] = line.phase;
    rotationAmplitudes[index] = line.rotationAmplitude;
  });

  const background = hexToRgba(settings.backgroundColor, 1);
  const blob = hexToRgba(settings.blobColor, 1);
  const uniforms = bundle.material.uniforms;

  bundle.renderer.setSize(settings.width, settings.height, false);
  uniforms.u_resolution.value.set(settings.width, settings.height);
  uniforms.u_lineCount.value = lines.length;
  uniforms.u_offsets.value = offsets;
  uniforms.u_phases.value = phases;
  uniforms.u_rotationAmplitudes.value = rotationAmplitudes;
  uniforms.u_lineWidth.value = settings.lineWidth;
  uniforms.u_cornerRadius.value = settings.cornerRadius;
  uniforms.u_timePhase.value = phase;
  uniforms.u_motionAmount.value = settings.motionEnabled ? settings.motionAmount : 0;
  uniforms.u_backgroundColor.value.set(background[0], background[1], background[2], background[3]);
  uniforms.u_blobColor.value.set(blob[0], blob[1], blob[2], blob[3]);
  uniforms.u_transparentBackground.value = settings.transparentBackground ? 1 : 0;
  bundle.renderer.render(bundle.scene, bundle.camera);
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

    return () => {
      glRef.current?.quad.geometry.dispose();
      glRef.current?.material.dispose();
      glRef.current?.renderer.dispose();
      glRef.current = null;
    };
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
