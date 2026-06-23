import { useEffect, useMemo, useRef, useState } from 'react';
import { DialRoot, DialStore, useDialKit, type DialConfig } from 'dialkit';
import 'dialkit/styles.css';
import './App.css';
import { NoiseCanvas, type GradientControlChange, type NoiseSettings, type PathWaypoint } from './components/NoiseCanvas';

const defaultSeed = 'TC-48291';
const minGradientStops = 2;
const maxGradientStops = 6;
const defaultGradientStops = [
  { color: '#7DB2FF', position: 0 },
  { color: '#D9EAFF', position: 0.35 },
  { color: '#8FFFD2', position: 0.72 },
  { color: '#FFFFFF', position: 1 },
  { color: '#B6A3FF', position: 0.55 },
  { color: '#FFE08A', position: 0.9 },
] as const;

type BindingsSource = 'noise' | 'svg' | 'video' | 'image';
type SvgMode = '2d' | '3d';
type GradientStopIndex = 1 | 2 | 3 | 4 | 5 | 6;

type GradientStopControlFields = {
  [K in GradientStopIndex as `gradientStop${K}Color`]?: string;
} & {
  [K in GradientStopIndex as `gradientStop${K}Position`]?: number;
};

type LabControls = {
  refresh: boolean;
  randomize: boolean;
  reset: boolean;
  seed: string;
  Bindings?: {
    source: string;
    loadSvg?: boolean;
    loadVideo?: boolean;
    loadImage?: boolean;
    renderMode?: string;
    terrainHeight?: number;
    terrainDepth?: number;
    terrainPitch?: number;
    terrainDistance?: number;
    terrainGlow?: number;
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
  };
  Color?: GradientStopControlFields & {
    backgroundColor: string;
    foregroundColor?: string;
    colorMode: string;
    gradientType?: string;
    toggleGradientEdit?: boolean;
    addStop?: boolean;
    removeStop?: boolean;
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
  Path?: {
    enabled: boolean;
    mode: string;
    edit: boolean;
    clearPoints?: boolean;
    thickness: number;
    endpointSpread: number;
    snapRadius: number;
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

function isBindingsSource(value: string): value is BindingsSource {
  return value === 'noise' || value === 'svg' || value === 'video' || value === 'image';
}

function slider(defaultValue: number, min: number, max: number, step: number): [number, number, number, number] {
  return [defaultValue, min, max, step];
}

function isSvgMode(value: string): value is SvgMode {
  return value === '2d' || value === '3d';
}

function createGradientStopControls(count: number) {
  const controls: Record<string, unknown> = {};
  for (let index = 0; index < count; index += 1) {
    const stop = defaultGradientStops[index];
    const labelNumber = index + 1;
    controls[`gradientStop${labelNumber}Color`] = stop.color;
    if (index > 0 && index < count - 1) {
      controls[`gradientStop${labelNumber}Position`] = slider(stop.position, 0, 1, 0.01);
    }
  }
  return controls;
}

function createDialConfig(
  bindingsSource: BindingsSource,
  svgNoiseEnabled: boolean,
  svgMode: SvgMode,
  videoDuration: number | null,
  pathEnabled: boolean,
  pathMode: string,
  gradientStopCount: number,
  gradientEditEnabled: boolean,
  colorMode: 'solid' | 'gradient',
  gradientType: 'linear' | 'radial',
): DialConfig {
  const effectiveLoopDuration = bindingsSource === 'video'
    ? Math.max(0.25, videoDuration ?? 8)
    : 8;

  return {
    refresh: { type: 'action', label: 'Refresh' },
    randomize: { type: 'action', label: 'Randomize Seed' },
    reset: { type: 'action', label: 'Reset' },
    seed: { type: 'text', label: 'Seed', default: defaultSeed },
    Bindings: {
      source: {
        type: 'select',
        default: bindingsSource,
        options: [
          { value: 'noise', label: 'Noise' },
          { value: 'svg', label: 'SVG' },
          { value: 'video', label: 'Video' },
          { value: 'image', label: 'Image' },
        ],
      },
      renderMode: {
        type: 'select',
        default: 'flat',
        options: [
          { value: 'flat', label: 'Flat' },
          { value: 'terrain', label: 'Terrain' },
        ],
      },
      terrainHeight: slider(0.55, 0, 1, 0.01),
      terrainDepth: slider(1, 0.4, 2, 0.01),
      terrainPitch: slider(0.42, 0, 1, 0.01),
      terrainDistance: slider(0.72, 0.2, 1.4, 0.01),
      terrainGlow: slider(0.72, 0, 1, 0.01),
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
      ...(bindingsSource === 'image'
        ? {
            loadImage: { type: 'action', label: 'Load Image' },
          }
        : {}),
      size: slider(0.42, 0.05, 1, 0.01),
      complexity: slider(0.5, 0, 1, 0.01),
      contrast: slider(0.58, 0, 1, 0.01),
      brightness: slider(0.48, 0, 1, 0.01),
      ...(bindingsSource === 'video' || bindingsSource === 'image'
        ? {
            videoThreshold: slider(0.5, 0, 1, 0.01),
            videoInvert: false,
            videoPositionX: slider(0, -1, 1, 0.01),
            videoPositionY: slider(0, -1, 1, 0.01),
            videoScale: slider(1, 0.1, 2.5, 0.01),
          }
        : {}),
      showMap: false,
      nodeDensity: slider(0.64, 0.05, 1, 0.01),
      connectionDensity: slider(0.74, 0, 1, 0.01),
      angleBias: slider(0.82, 0, 1, 0.01),
      organicity: slider(0.42, 0, 1, 0.01),
      nodeSize: slider(0.86, 0.2, 2.4, 0.02),
      lineWidth: slider(0.58, 0.12, 2.4, 0.02),
    },
    Color: {
      backgroundColor: '#041426',
      colorMode: {
        type: 'select',
        default: colorMode,
        options: [
          { value: 'solid', label: 'Solid' },
          { value: 'gradient', label: 'Gradient' },
        ],
      },
      ...(colorMode === 'solid'
        ? {
            foregroundColor: '#7DB2FF',
          }
        : {
            gradientType: {
              type: 'select',
              default: gradientType,
              options: [
                { value: 'linear', label: 'Linear' },
                { value: 'radial', label: 'Radial' },
              ],
            },
            toggleGradientEdit: { type: 'action', label: gradientEditEnabled ? 'Hide Editor' : 'Edit Gradient' },
            addStop: { type: 'action', label: 'Add Stop' },
            removeStop: { type: 'action', label: 'Remove Stop' },
            ...createGradientStopControls(gradientStopCount),
          }),
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
      ...(pathEnabled
        ? {
            mode: {
              type: 'select',
              default: pathMode === 'manual' ? 'manual' : 'auto',
              options: [
                { value: 'auto', label: 'Auto' },
                { value: 'manual', label: 'Manual' },
              ],
            },
            ...(pathMode === 'manual'
              ? {
                  edit: false,
                  clearPoints: { type: 'action', label: 'Clear Points' },
                }
              : {}),
          }
        : {}),
      thickness: slider(1.35, 0.4, 8, 0.1),
      endpointSpread: slider(0.72, 0, 1, 0.01),
      snapRadius: slider(18, 4, 80, 1),
      color: '#FFFFFF',
    },
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
  imageDataUrl: string | null,
  videoDuration: number | null,
  pathManualPoints: PathWaypoint[],
  gradientStopCount: number,
  gradientEditEnabled: boolean,
  colorMode: 'solid' | 'gradient',
  gradientType: 'linear' | 'radial',
  gradientVector: { startX: number; startY: number; endX: number; endY: number },
): NoiseSettings {
  const bindings = controls.Bindings;
  const color = controls.Color;
  const svg = controls.SVG;
  const path = controls.Path;
  const motion = controls.Motion;
  const exportControls = controls.Export;
  const gradientStops = Array.from({ length: gradientStopCount }, (_, index) => {
    const number = index + 1 as GradientStopIndex;
    const defaults = defaultGradientStops[index];
    return {
      color: color?.[`gradientStop${number}Color`] ?? defaults.color,
      position: index === 0 ? 0 : index === gradientStopCount - 1 ? 1 : color?.[`gradientStop${number}Position`] ?? defaults.position,
    };
  });

  return {
    seed,
    source: bindings?.source === 'svg' ? 'svg' : bindings?.source === 'video' ? 'video' : bindings?.source === 'image' ? 'image' : 'noise',
    renderMode: bindings?.renderMode === 'terrain' ? 'terrain' : 'flat',
    svgDataUrl,
    svgMode: svg?.mode === '3d' ? '3d' : '2d',
    svgNoiseEnabled: svg?.noise ?? false,
    svgPositionX: svg?.positionX ?? 0,
    svgPositionY: svg?.positionY ?? 0,
    svgScale: svg?.scale ?? 1,
    svgExtrude: svg?.extrude ?? 0.22,
    svgAnimate: svg?.animate ?? true,
    videoDataUrl,
    imageDataUrl,
    videoThreshold: bindings?.videoThreshold ?? 0.5,
    videoInvert: bindings?.videoInvert ?? false,
    videoPositionX: bindings?.videoPositionX ?? 0,
    videoPositionY: bindings?.videoPositionY ?? 0,
    videoScale: bindings?.videoScale ?? 1,
    terrainHeight: bindings?.terrainHeight ?? 0.55,
    terrainDepth: bindings?.terrainDepth ?? 1,
    terrainPitch: bindings?.terrainPitch ?? 0.42,
    terrainDistance: bindings?.terrainDistance ?? 0.72,
    terrainGlow: bindings?.terrainGlow ?? 0.72,
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
    backgroundColor: color?.backgroundColor ?? '#041426',
    foregroundColor: color?.foregroundColor ?? '#7DB2FF',
    colorMode,
    gradientType,
    gradientEdit: gradientEditEnabled,
    gradientAngle: Math.atan2(gradientVector.endY - gradientVector.startY, gradientVector.endX - gradientVector.startX) * 180 / Math.PI,
    gradientStartX: gradientVector.startX,
    gradientStartY: gradientVector.startY,
    gradientEndX: gradientVector.endX,
    gradientEndY: gradientVector.endY,
    gradientRadius: Math.hypot(gradientVector.endX - gradientVector.startX, gradientVector.endY - gradientVector.startY),
    gradientStops,
    pathEnabled: path?.enabled ?? true,
    pathMode: path?.mode === 'manual' ? 'manual' : 'auto',
    pathManualPoints,
    pathSnapRadius: path?.snapRadius ?? 18,
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

function Lab() {
  const [bindingsSource, setBindingsSource] = useState<BindingsSource>('noise');
  const [svgNoiseEnabled, setSvgNoiseEnabled] = useState(false);
  const [svgMode, setSvgMode] = useState<SvgMode>('2d');
  const [pathEnabled, setPathEnabled] = useState(true);
  const [pathMode, setPathMode] = useState<'auto' | 'manual'>('auto');
  const svgInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [svgDataUrl, setSvgDataUrl] = useState<string | null>(null);
  const [videoDataUrl, setVideoDataUrl] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);
  const [pendingExport, setPendingExport] = useState(false);
  const [videoExportNonce, setVideoExportNonce] = useState(0);
  const [pathManualPoints, setPathManualPoints] = useState<PathWaypoint[]>([]);
  const [gradientStopCount, setGradientStopCount] = useState(4);
  const [gradientEditEnabled, setGradientEditEnabled] = useState(false);
  const [colorMode, setColorMode] = useState<'solid' | 'gradient'>('solid');
  const [gradientType, setGradientType] = useState<'linear' | 'radial'>('linear');
  const [gradientVector, setGradientVector] = useState({
    startX: 0,
    startY: 0.5,
    endX: 1,
    endY: 0.5,
  });
  const config = useMemo(
    () => createDialConfig(bindingsSource, svgNoiseEnabled, svgMode, videoDuration, pathEnabled, pathMode, gradientStopCount, gradientEditEnabled, colorMode, gradientType),
    [bindingsSource, colorMode, gradientEditEnabled, gradientStopCount, gradientType, pathEnabled, pathMode, svgMode, svgNoiseEnabled, videoDuration],
  );
  const panelName = 'TrueCourse Patterns';

  const controls = useDialKit(
    panelName,
    config,
    {
      onAction: (action) => {
        if (action === 'refresh') setNonce((value) => value + 1);
        if (action === 'randomize') {
          const nextSeed = randomSeed();
          const panel = DialStore.getPanels().find((item) => item.name === panelName);
          if (panel) DialStore.updateValue(panel.id, 'seed', nextSeed);
          setNonce((value) => value + 1);
        }
        if (action === 'reset') window.location.reload();
        if (action === 'Bindings.loadSvg' || action === 'loadSvg') svgInputRef.current?.click();
        if (action === 'Bindings.loadVideo' || action === 'loadVideo') videoInputRef.current?.click();
        if (action === 'Bindings.loadImage' || action === 'loadImage') imageInputRef.current?.click();
        if (action === 'Color.toggleGradientEdit' || action === 'toggleGradientEdit') setGradientEditEnabled((value) => !value);
        if (action === 'Color.addStop' || action === 'addStop') setGradientStopCount((value) => Math.min(maxGradientStops, value + 1));
        if (action === 'Color.removeStop' || action === 'removeStop') setGradientStopCount((value) => Math.max(minGradientStops, value - 1));
        if (action === 'Path.clearPoints' || action === 'clearPoints') setPathManualPoints([]);
        if (action === 'Export.exportPng' || action === 'exportPng') setPendingExport(true);
        if (action === 'Export.exportMp4' || action === 'exportMp4') setVideoExportNonce((value) => value + 1);
      },
    },
  ) as unknown as LabControls;

  const updateGradientControl = (change: GradientControlChange) => {
    if (change.type === 'gradient-start') {
      setGradientVector((value) => ({ ...value, startX: change.x, startY: change.y }));
      return;
    }
    if (change.type === 'gradient-end') {
      setGradientVector((value) => ({ ...value, endX: change.x, endY: change.y }));
      return;
    }
    const panel = DialStore.getPanels().find((item) => item.name === panelName);
    if (!panel) return;
    DialStore.updateValue(panel.id, `Color.${change.key}`, Number(change.value.toFixed(3)));
  };

  useEffect(() => {
    const nextSource = controls.Bindings?.source;
    if (nextSource && isBindingsSource(nextSource) && nextSource !== bindingsSource) {
      setBindingsSource(nextSource);
    }
  }, [bindingsSource, controls.Bindings?.source]);

  useEffect(() => {
    const nextColorMode = controls.Color?.colorMode === 'gradient' ? 'gradient' : 'solid';
    if (nextColorMode !== colorMode) {
      setColorMode(nextColorMode);
      if (nextColorMode === 'solid') setGradientEditEnabled(false);
    }
  }, [colorMode, controls.Color?.colorMode]);

  useEffect(() => {
    const nextGradientType = controls.Color?.gradientType === 'radial' ? 'radial' : 'linear';
    if (nextGradientType !== gradientType) setGradientType(nextGradientType);
  }, [controls.Color?.gradientType, gradientType]);

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
    const nextPathEnabled = controls.Path?.enabled ?? true;
    if (nextPathEnabled !== pathEnabled) setPathEnabled(nextPathEnabled);
  }, [controls.Path?.enabled, pathEnabled]);

  useEffect(() => {
    const nextPathMode = controls.Path?.mode === 'manual' ? 'manual' : 'auto';
    if (nextPathMode !== pathMode) setPathMode(nextPathMode);
  }, [controls.Path?.mode, pathMode]);

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

  const settings = useMemo<NoiseSettings>(() => {
    const seed = `${controls.seed ?? defaultSeed}:${nonce}`;
    return createBindingsSettings(controls, seed, videoExportNonce, svgDataUrl, videoDataUrl, imageDataUrl, videoDuration, pathManualPoints, gradientStopCount, gradientEditEnabled, colorMode, gradientType, gradientVector);
  }, [colorMode, controls, gradientEditEnabled, gradientStopCount, gradientType, gradientVector, imageDataUrl, nonce, pathManualPoints, svgDataUrl, videoDataUrl, videoDuration, videoExportNonce]);

  const debouncedSettings = useDebouncedValue(settings, 35);

  useEffect(() => {
    if (!pendingExport) return;
    const canvas = document.querySelector<HTMLCanvasElement>('.lab-canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `truecourse-bindings-${debouncedSettings.seed.replace(/[^a-z0-9-]/gi, '-')}.png`;
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
      <input
        ref={imageInputRef}
        className="file-input"
        type="file"
        accept="image/jpeg,image/png,.jpg,.jpeg,.png"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === 'string') setImageDataUrl(reader.result);
          };
          reader.readAsDataURL(file);
        }}
      />
      <section className="work-area">
        <NoiseCanvas
          settings={debouncedSettings}
          pathEditEnabled={controls.Path?.edit ?? false}
          onPathPointsChange={setPathManualPoints}
          onGradientControlChange={updateGradientControl}
        />
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
