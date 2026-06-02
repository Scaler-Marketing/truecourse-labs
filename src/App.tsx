import { useEffect, useMemo, useRef, useState } from 'react';
import { DialRoot, DialStore, useDialKit, type DialConfig } from 'dialkit';
import 'dialkit/styles.css';
import './App.css';
import { BlobsCanvas, type BlobsSettings } from './components/BlobsCanvas';
import { NoiseCanvas, type NoiseSettings } from './components/NoiseCanvas';

const defaultSeed = 'TC-48291';

type ShaderMode = 'bindings' | 'blobs';
type BindingsSource = 'noise' | 'svg' | 'video';
type SvgMode = '2d' | '3d';
type LabSettings =
  | { mode: 'bindings'; values: NoiseSettings }
  | { mode: 'blobs'; values: BlobsSettings };

type LabControls = {
  refresh: boolean;
  randomize: boolean;
  reset: boolean;
  Shader: {
    mode: string;
    seed: string;
  };
  Bindings?: {
    source: string;
    loadSvg?: boolean;
    loadVideo?: boolean;
    size: number;
    complexity: number;
    contrast: number;
    brightness: number;
    videoThreshold?: number;
    videoInvert?: boolean;
    videoPositionX?: number;
    videoPositionY?: number;
    videoScale?: number;
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
  };
  SVG?: {
    mode: string;
    noise: boolean;
    size: number;
    complexity: number;
    contrast: number;
    brightness: number;
    positionX: number;
    positionY: number;
    scale: number;
    extrude: number;
    animate: boolean;
  };
  Blobs?: {
    lineCount: number;
    lineWidth: number;
    cornerRadius: number;
    angleSpread: number;
    offsetJitter: number;
    backgroundColor: string;
    blobColor: string;
  };
  Path?: {
    enabled: boolean;
    thickness: number;
    endpointSpread: number;
    color: string;
  };
  Motion: {
    enabled: boolean;
    loopDuration?: number;
    amount: number;
    frameRate: number;
  };
  Export: {
    transparentBackground: boolean;
    exportPng: boolean;
    exportMp4: boolean;
    width: number;
    height: number;
  };
};

function randomSeed() {
  return `TC-${Math.floor(10000 + Math.random() * 89999)}`;
}

function isShaderMode(value: string): value is ShaderMode {
  return value === 'bindings' || value === 'blobs';
}

function isBindingsSource(value: string): value is BindingsSource {
  return value === 'noise' || value === 'svg' || value === 'video';
}

function slider(defaultValue: number, min: number, max: number, step: number): [number, number, number, number] {
  return [defaultValue, min, max, step];
}

function isSvgMode(value: string): value is SvgMode {
  return value === '2d' || value === '3d';
}

function createDialConfig(
  shaderMode: ShaderMode,
  bindingsSource: BindingsSource,
  svgNoiseEnabled: boolean,
  svgMode: SvgMode,
  videoDuration: number | null,
): DialConfig {
  const effectiveLoopDuration = bindingsSource === 'video'
    ? Math.max(0.25, videoDuration ?? 8)
    : 8;

  return {
    refresh: { type: 'action', label: 'Refresh' },
    randomize: { type: 'action', label: 'Randomize Seed' },
    reset: { type: 'action', label: 'Reset' },
    Shader: {
      mode: {
        type: 'select',
        default: shaderMode,
        options: [
          { value: 'bindings', label: 'Bindings' },
          { value: 'blobs', label: 'Blobs' },
        ],
      },
      seed: { type: 'text', default: defaultSeed },
    },
    ...(shaderMode === 'bindings'
      ? {
          Bindings: {
            source: {
              type: 'select',
              default: bindingsSource,
              options: [
                { value: 'noise', label: 'Noise' },
                { value: 'svg', label: 'SVG' },
                { value: 'video', label: 'Video' },
              ],
            },
            ...(bindingsSource === 'svg'
              ? {
                  loadSvg: { type: 'action', label: 'Load SVG' },
                }
              : {}),
            ...(bindingsSource === 'video'
              ? {
                  loadVideo: { type: 'action', label: 'Load Video' },
                }
              : {}),
            size: slider(0.42, 0.05, 1, 0.01),
            complexity: slider(0.5, 0, 1, 0.01),
            contrast: slider(0.58, 0, 1, 0.01),
            brightness: slider(0.48, 0, 1, 0.01),
            videoThreshold: slider(0.5, 0, 1, 0.01),
            videoInvert: false,
            videoPositionX: slider(0, -1, 1, 0.01),
            videoPositionY: slider(0, -1, 1, 0.01),
            videoScale: slider(1, 0.1, 2.5, 0.01),
            showMap: false,
            nodeDensity: slider(0.64, 0.05, 1, 0.01),
            connectionDensity: slider(0.74, 0, 1, 0.01),
            angleBias: slider(0.82, 0, 1, 0.01),
            organicity: slider(0.42, 0, 1, 0.01),
            nodeSize: slider(0.86, 0.2, 2.4, 0.02),
            lineWidth: slider(0.58, 0.12, 2.4, 0.02),
            backgroundColor: '#041426',
            lineColor: '#7DB2FF',
            nodeColor: '#D9EAFF',
          },
          ...(bindingsSource === 'svg'
            ? {
                SVG: {
                  mode: {
                    type: 'select',
                    default: svgMode,
                    options: [
                      { value: '2d', label: '2D' },
                      { value: '3d', label: '3D' },
                    ],
                  },
                  noise: false,
                  ...(svgNoiseEnabled
                    ? {
                        size: slider(0.42, 0.05, 1, 0.01),
                        complexity: slider(0.5, 0, 1, 0.01),
                        contrast: slider(0.58, 0, 1, 0.01),
                        brightness: slider(0.48, 0, 1, 0.01),
                      }
                    : {}),
                  positionX: slider(0, -1, 1, 0.01),
                  positionY: slider(0, -1, 1, 0.01),
                  scale: slider(1, 0.1, 2.5, 0.01),
                  ...(svgMode === '3d'
                    ? {
                        extrude: slider(0.22, 0.02, 1.2, 0.01),
                        animate: true,
                      }
                    : {}),
                },
              }
            : {}),
          Path: {
            enabled: true,
            thickness: slider(1.35, 0.4, 8, 0.1),
            endpointSpread: slider(0.72, 0, 1, 0.01),
            color: '#FFFFFF',
          },
        }
      : {
          Blobs: {
            lineCount: slider(16, 4, 28, 1),
            lineWidth: slider(70, 16, 180, 1),
            cornerRadius: slider(82, 0, 220, 1),
            angleSpread: slider(0.82, 0, 1, 0.01),
            offsetJitter: slider(0.58, 0, 1, 0.01),
            backgroundColor: '#79BAEF',
            blobColor: '#74DCEB',
          },
        }),
    Motion: {
      enabled: false,
      loopDuration: bindingsSource === 'video'
        ? slider(effectiveLoopDuration, 0.25, Math.max(0.5, effectiveLoopDuration), 0.01)
        : slider(8, 2, 30, 0.5),
      amount: slider(0.38, 0, 1, 0.01),
      frameRate: slider(30, 6, 30, 1),
    },
    Export: {
      transparentBackground: false,
      exportPng: { type: 'action', label: 'Export PNG' },
      exportMp4: { type: 'action', label: 'Export MP4' },
      width: slider(1440, 640, 2400, 10),
      height: slider(900, 480, 1800, 10),
    },
  };
}

function useDebouncedValue<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);

  return debounced;
}

function readVideoDuration(src: string) {
  return new Promise<number | null>((resolve) => {
    const video = document.createElement('video');
    const cleanup = () => {
      video.removeAttribute('src');
      video.load();
    };
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
      cleanup();
      resolve(duration);
    };
    video.onerror = () => {
      cleanup();
      resolve(null);
    };
    video.src = src;
  });
}

function createBindingsSettings(
  controls: LabControls,
  seed: string,
  videoExportNonce: number,
  svgDataUrl: string | null,
  videoDataUrl: string | null,
  videoDuration: number | null,
): NoiseSettings {
  const bindings = controls.Bindings;
  const svg = controls.SVG;
  const path = controls.Path;
  const motion = controls.Motion;
  const exportControls = controls.Export;

  return {
    seed,
    source: bindings?.source === 'svg' ? 'svg' : bindings?.source === 'video' ? 'video' : 'noise',
    svgDataUrl,
    svgMode: svg?.mode === '3d' ? '3d' : '2d',
    svgNoiseEnabled: svg?.noise ?? false,
    svgPositionX: svg?.positionX ?? 0,
    svgPositionY: svg?.positionY ?? 0,
    svgScale: svg?.scale ?? 1,
    svgExtrude: svg?.extrude ?? 0.22,
    svgAnimate: svg?.animate ?? true,
    videoDataUrl,
    videoThreshold: bindings?.videoThreshold ?? 0.5,
    videoInvert: bindings?.videoInvert ?? false,
    videoPositionX: bindings?.videoPositionX ?? 0,
    videoPositionY: bindings?.videoPositionY ?? 0,
    videoScale: bindings?.videoScale ?? 1,
    size: bindings?.size ?? svg?.size ?? 0.42,
    complexity: bindings?.complexity ?? svg?.complexity ?? 0.5,
    contrast: bindings?.contrast ?? svg?.contrast ?? 0.58,
    brightness: bindings?.brightness ?? svg?.brightness ?? 0.48,
    showMap: bindings?.showMap ?? false,
    nodeDensity: bindings?.nodeDensity ?? 0.64,
    connectionDensity: bindings?.connectionDensity ?? 0.74,
    angleBias: bindings?.angleBias ?? 0.82,
    organicity: bindings?.organicity ?? 0.42,
    nodeSize: bindings?.nodeSize ?? 0.86,
    lineWidth: bindings?.lineWidth ?? 0.58,
    backgroundColor: bindings?.backgroundColor ?? '#041426',
    lineColor: bindings?.lineColor ?? '#7DB2FF',
    nodeColor: bindings?.nodeColor ?? '#D9EAFF',
    pathEnabled: path?.enabled ?? true,
    pathThickness: path?.thickness ?? 1.35,
    pathEndpointSpread: path?.endpointSpread ?? 0.72,
    pathColor: path?.color ?? '#FFFFFF',
    motionEnabled: motion.enabled,
    loopDuration: bindings?.source === 'video'
      ? Math.max(0.25, videoDuration ?? motion.loopDuration ?? 8)
      : motion.loopDuration ?? 8,
    motionAmount: motion.amount,
    frameRate: Math.round(motion.frameRate),
    transparentBackground: exportControls.transparentBackground,
    videoExportNonce,
    width: Math.round(exportControls.width),
    height: Math.round(exportControls.height),
  };
}

function createBlobsSettings(
  controls: LabControls,
  seed: string,
  videoExportNonce: number,
): BlobsSettings {
  const blobs = controls.Blobs;
  const motion = controls.Motion;
  const exportControls = controls.Export;

  return {
    seed,
    lineCount: blobs?.lineCount ?? 16,
    lineWidth: blobs?.lineWidth ?? 70,
    cornerRadius: blobs?.cornerRadius ?? 82,
    angleSpread: blobs?.angleSpread ?? 0.82,
    offsetJitter: blobs?.offsetJitter ?? 0.58,
    backgroundColor: blobs?.backgroundColor ?? '#79BAEF',
    blobColor: blobs?.blobColor ?? '#74DCEB',
    motionEnabled: motion.enabled,
    loopDuration: motion.loopDuration ?? 8,
    motionAmount: motion.amount,
    frameRate: Math.round(motion.frameRate),
    transparentBackground: exportControls.transparentBackground,
    videoExportNonce,
    width: Math.round(exportControls.width),
    height: Math.round(exportControls.height),
  };
}

function Lab() {
  const [shaderMode, setShaderMode] = useState<ShaderMode>('bindings');
  const [bindingsSource, setBindingsSource] = useState<BindingsSource>('noise');
  const [svgNoiseEnabled, setSvgNoiseEnabled] = useState(false);
  const [svgMode, setSvgMode] = useState<SvgMode>('2d');
  const svgInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const [svgDataUrl, setSvgDataUrl] = useState<string | null>(null);
  const [videoDataUrl, setVideoDataUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [seedOverride, setSeedOverride] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [pendingExport, setPendingExport] = useState(false);
  const [videoExportNonce, setVideoExportNonce] = useState(0);
  const config = useMemo(
    () => createDialConfig(shaderMode, bindingsSource, svgNoiseEnabled, svgMode, videoDuration),
    [bindingsSource, shaderMode, svgMode, svgNoiseEnabled, videoDuration],
  );
  const panelName = useMemo(() => {
    if (shaderMode === 'bindings') return `Noise Field / ${bindingsSource}${bindingsSource === 'video' ? ` / ${videoDuration ?? 'pending'}` : ''}`;
    return 'Noise Field / blobs';
  }, [bindingsSource, shaderMode, videoDuration]);

  const controls = useDialKit(
    panelName,
    config,
    {
      onAction: (action) => {
        if (action === 'refresh') setNonce((value) => value + 1);
        if (action === 'randomize') {
          setSeedOverride(randomSeed());
          setNonce((value) => value + 1);
        }
        if (action === 'reset') window.location.reload();
        if (action === 'Bindings.loadSvg' || action === 'loadSvg') svgInputRef.current?.click();
        if (action === 'Bindings.loadVideo' || action === 'loadVideo') videoInputRef.current?.click();
        if (action === 'Export.exportPng' || action === 'exportPng') setPendingExport(true);
        if (action === 'Export.exportMp4' || action === 'exportMp4') setVideoExportNonce((value) => value + 1);
      },
    },
  ) as unknown as LabControls;

  useEffect(() => {
    const nextMode = controls.Shader.mode;
    if (isShaderMode(nextMode) && nextMode !== shaderMode) {
      setShaderMode(nextMode);
    }
  }, [controls.Shader.mode, shaderMode]);

  useEffect(() => {
    const nextSource = controls.Bindings?.source;
    if (nextSource && isBindingsSource(nextSource) && nextSource !== bindingsSource) {
      setBindingsSource(nextSource);
    }
  }, [bindingsSource, controls.Bindings?.source]);

  useEffect(() => {
    const nextSvgNoise = controls.SVG?.noise ?? false;
    if (nextSvgNoise !== svgNoiseEnabled) setSvgNoiseEnabled(nextSvgNoise);
  }, [controls.SVG?.noise, svgNoiseEnabled]);

  useEffect(() => {
    const nextSvgMode = controls.SVG?.mode;
    if (nextSvgMode && isSvgMode(nextSvgMode) && nextSvgMode !== svgMode) {
      setSvgMode(nextSvgMode);
    }
  }, [controls.SVG?.mode, svgMode]);

  useEffect(() => {
    if (bindingsSource !== 'video' || !videoDuration) return;
    const panel = DialStore.getPanels().find((item) => item.name === panelName);
    if (!panel) return;
    DialStore.updateValue(panel.id, 'Motion.loopDuration', Number(videoDuration.toFixed(2)));
  }, [bindingsSource, panelName, videoDuration]);

  useEffect(() => {
    const controlsRoot = document.querySelector<HTMLElement>('.control-rail');
    if (!controlsRoot) return;
    const labels = Array.from(controlsRoot.querySelectorAll<HTMLElement>('.dialkit-slider-label'));
    const loopLabel = labels.find((label) => label.textContent?.trim().startsWith('Loop Duration'));
    const wrapper = loopLabel?.closest<HTMLElement>('.dialkit-slider-wrapper');
    if (!wrapper) return;

    if (bindingsSource === 'video') {
      wrapper.style.pointerEvents = 'none';
      wrapper.style.opacity = '0.48';
      wrapper.title = 'Video mode uses the uploaded video duration.';
      return;
    }

    wrapper.style.pointerEvents = '';
    wrapper.style.opacity = '';
    wrapper.removeAttribute('title');
  }, [bindingsSource, panelName, videoDuration]);

  const settings: LabSettings = useMemo(() => {
    const seed = `${seedOverride ?? controls.Shader.seed}:${nonce}`;
    return shaderMode === 'blobs'
      ? { mode: 'blobs', values: createBlobsSettings(controls, seed, videoExportNonce) }
      : { mode: 'bindings', values: createBindingsSettings(controls, seed, videoExportNonce, svgDataUrl, videoDataUrl, videoDuration) };
  }, [controls, nonce, seedOverride, shaderMode, svgDataUrl, videoDataUrl, videoDuration, videoExportNonce]);

  const debouncedSettings = useDebouncedValue(settings, 35);

  useEffect(() => {
    if (!pendingExport) return;
    const canvas = document.querySelector<HTMLCanvasElement>('.lab-canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `truecourse-${debouncedSettings.mode}-${debouncedSettings.values.seed.replace(/[^a-z0-9-]/gi, '-')}.png`;
    link.click();
    setPendingExport(false);
  }, [debouncedSettings, pendingExport]);

  return (
    <main className="app-shell">
      <input
        ref={svgInputRef}
        className="file-input"
        type="file"
        accept=".svg,image/svg+xml"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === 'string') setSvgDataUrl(reader.result);
          };
          reader.readAsDataURL(file);
        }}
      />
      <input
        ref={videoInputRef}
        className="file-input"
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/*"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result !== 'string') return;
            setVideoDataUrl(reader.result);
            setVideoDuration(null);
            void readVideoDuration(reader.result).then(setVideoDuration);
          };
          reader.readAsDataURL(file);
        }}
      />
      <section className="work-area">
        {debouncedSettings.mode === 'blobs'
          ? <BlobsCanvas settings={debouncedSettings.values} />
          : <NoiseCanvas settings={debouncedSettings.values} />}
      </section>

      <aside className="control-rail">
        <DialRoot mode="inline" theme="dark" productionEnabled />
      </aside>
    </main>
  );
}

export default function App() {
  return <Lab />;
}
