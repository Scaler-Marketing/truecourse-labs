import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { DialRoot, DialStore, useDialKit, type DialConfig, type DialValue, type Preset } from 'dialkit';
import { Check, Pencil, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react';
import 'dialkit/styles.css';
import './App.css';
import { NoiseCanvas, type CompositionPath, type GradientControlChange, type NoiseSettings, type PathWaypoint, type SelectedPathPoint, type TerrainCameraControlChange } from './components/NoiseCanvas';

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
    terrainCoverage?: number;
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
  Camera?: {
    positionX: number;
    positionY: number;
    positionZ: number;
    targetX: number;
    targetY: number;
    targetZ: number;
    fov: number;
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

function createDefaultPath(index: number): CompositionPath {
  return {
    id: `path-${Date.now().toString(36)}-${index.toString(36)}`,
    name: `Path ${index}`,
    mode: index === 1 ? 'auto' : 'manual',
    points: [],
    enabled: true,
  };
}
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
  renderMode: 'flat' | 'terrain',
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
        default: renderMode,
        options: [
          { value: 'flat', label: 'Flat' },
          { value: 'terrain', label: 'Terrain' },
        ],
      },
      ...(renderMode === 'terrain'
        ? {
            terrainHeight: slider(0.55, 0, 1, 0.01),
            terrainDepth: slider(1, 0.4, 2, 0.01),
            terrainCoverage: slider(1, 0.75, 2.5, 0.01),
            terrainGlow: slider(0.72, 0, 1, 0.01),
          }
        : {}),
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
    ...(renderMode === 'terrain'
      ? {
          Camera: {
            positionX: slider(0, -1.5, 1.5, 0.01),
            positionY: slider(0.34, -0.2, 1.25, 0.01),
            positionZ: slider(0.94, -0.5, 1.8, 0.01),
            targetX: slider(0, -1.5, 1.5, 0.01),
            targetY: slider(0.02, -0.35, 0.85, 0.01),
            targetZ: slider(-0.18, -1.2, 1.2, 0.01),
            fov: slider(42, 20, 75, 1),
          },
        }
      : {}),
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
      width: slider(1440, 32, 2400, 1),
      height: slider(900, 32, 1800, 1),
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
const presetStorageVersion = 1;
const presetStoragePrefix = 'truecourse-labs:dialkit-presets';

type StoredPresetState = {
  version: typeof presetStorageVersion;
  presets: Preset[];
  activePresetId: string | null;
};

type DialStoreInternals = {
  presets?: Map<string, Preset[]>;
  activePreset?: Map<string, string | null>;
  snapshots?: Map<string, Record<string, DialValue>>;
  notify?: (panelId: string) => void;
  savePreset: (panelId: string, name: string) => string;
};

let presetSavePatchInstalled = false;

function presetStorageKey(panelName: string) {
  return `${presetStoragePrefix}:v${presetStorageVersion}:${panelName}`;
}

function clonePreset(preset: Preset): Preset {
  return {
    id: preset.id,
    name: preset.name,
    values: { ...preset.values },
  };
}

function parseStoredPresetState(value: string | null): StoredPresetState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<StoredPresetState>;
    if (parsed.version !== presetStorageVersion || !Array.isArray(parsed.presets)) return null;
    const presets = parsed.presets
      .filter((preset): preset is Preset => (
        typeof preset?.id === 'string'
        && typeof preset.name === 'string'
        && preset.values !== null
        && typeof preset.values === 'object'
        && !Array.isArray(preset.values)
      ))
      .map(clonePreset);
    const activePresetId = typeof parsed.activePresetId === 'string'
      && presets.some((preset) => preset.id === parsed.activePresetId)
      ? parsed.activePresetId
      : null;
    return { version: presetStorageVersion, presets, activePresetId };
  } catch {
    return null;
  }
}

function loadStoredPresetState(panelName: string): StoredPresetState | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseStoredPresetState(window.localStorage.getItem(presetStorageKey(panelName)));
  } catch {
    return null;
  }
}

function saveStoredPresetState(panelId: string, panelName: string) {
  if (typeof window === 'undefined') return;
  const state: StoredPresetState = {
    version: presetStorageVersion,
    presets: DialStore.getPresets(panelId).map(clonePreset),
    activePresetId: DialStore.getActivePresetId(panelId),
  };
  try {
    window.localStorage.setItem(presetStorageKey(panelName), JSON.stringify(state));
  } catch {
    // Storage can be unavailable in some browser privacy modes.
  }
}

function hydrateStoredPresetState(panelId: string, panelName: string) {
  const stored = loadStoredPresetState(panelName);
  if (!stored) return;

  const store = DialStore as unknown as DialStoreInternals;
  const panel = DialStore.getPanel(panelId);
  store.presets?.set(panelId, stored.presets.map(clonePreset));
  store.activePreset?.set(panelId, stored.activePresetId);

  const activePreset = stored.presets.find((preset) => preset.id === stored.activePresetId);
  if (panel && activePreset) {
    panel.values = { ...activePreset.values };
    store.snapshots?.set(panelId, { ...activePreset.values });
  }

  store.notify?.(panelId);
}

function installPresetSavePatch(panelName: string) {
  if (presetSavePatchInstalled || typeof window === 'undefined') return;
  presetSavePatchInstalled = true;

  const store = DialStore as unknown as DialStoreInternals;
  const originalSavePreset = store.savePreset.bind(DialStore);
  store.savePreset = (panelId: string, name: string) => {
    const presetId = originalSavePreset(panelId, name);
    const panel = DialStore.getPanel(panelId);
    if (panel?.name === panelName) {
      window.dispatchEvent(new CustomEvent('truecourse:preset-created', { detail: { panelId, presetId } }));
    }
    return presetId;
  };
}

function renamePreset(panelId: string, presetId: string, name: string) {
  const store = DialStore as unknown as DialStoreInternals;
  const presets = store.presets?.get(panelId);
  const preset = presets?.find((item) => item.id === presetId);
  if (!preset) return;
  preset.name = name;
  store.notify?.(panelId);
}

function createBindingsSettings(
  controls: LabControls,
  seed: string,
  videoExportNonce: number,
  svgDataUrl: string | null,
  videoDataUrl: string | null,
  imageDataUrl: string | null,
  videoDuration: number | null,
  paths: CompositionPath[],
  activePathId: string,
  selectedPathPoint: SelectedPathPoint | null,
  gradientStopCount: number,
  gradientEditEnabled: boolean,
  colorMode: 'solid' | 'gradient',
  gradientType: 'linear' | 'radial',
  gradientVector: { startX: number; startY: number; endX: number; endY: number },
): NoiseSettings {
  const bindings = controls.Bindings;
  const color = controls.Color;
  const camera = controls.Camera;
  const svg = controls.SVG;
  const path = controls.Path;
  const motion = controls.Motion;
  const exportControls = controls.Export;
  const activePath = paths.find((item) => item.id === activePathId) ?? paths[0];
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
    terrainCoverage: bindings?.terrainCoverage ?? 1,
    terrainGlow: bindings?.terrainGlow ?? 0.72,
    terrainCameraPositionX: camera?.positionX ?? 0,
    terrainCameraPositionY: camera?.positionY ?? 0.34,
    terrainCameraPositionZ: camera?.positionZ ?? 0.94,
    terrainCameraTargetX: camera?.targetX ?? 0,
    terrainCameraTargetY: camera?.targetY ?? 0.02,
    terrainCameraTargetZ: camera?.targetZ ?? -0.18,
    terrainCameraFov: camera?.fov ?? 42,
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
    pathMode: activePath?.mode ?? (path?.mode === 'manual' ? 'manual' : 'auto'),
    pathManualPoints: activePath?.points ?? [],
    paths,
    activePathId: activePath?.id ?? activePathId,
    selectedPathPoint,
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

type PresetModalState =
  | { mode: 'create'; panelId: string; presetId: string }
  | { mode: 'rename'; panelId: string; presetId: string }
  | { mode: 'manage'; panelId: string };

type PresetModalProps = {
  state: PresetModalState;
  presets: Preset[];
  activePresetId: string | null;
  onClose: () => void;
  onRename: (panelId: string, presetId: string, name: string) => void;
  onRequestRename: (panelId: string, presetId: string) => void;
  onDelete: (panelId: string, presetId: string) => void;
  onSelect: (panelId: string, presetId: string) => void;
};

type PresetManageButtonProps = {
  panelId: string | null;
  onManage: () => void;
};

function PresetManageButton({ panelId, onManage }: PresetManageButtonProps) {
  const [toolbar, setToolbar] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let frame = 0;

    const findToolbar = () => {
      const nextToolbar = document.querySelector<HTMLElement>('.control-rail .dialkit-panel-toolbar');
      setToolbar((currentToolbar) => (currentToolbar === nextToolbar ? currentToolbar : nextToolbar));
      return nextToolbar;
    };

    const observer = new MutationObserver(() => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(findToolbar);
    });

    findToolbar();
    observer.observe(document.body, { childList: true, subtree: true });
    frame = window.requestAnimationFrame(findToolbar);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  if (!toolbar) return null;

  return createPortal(
    <div className="preset-manage-row">
      <button
        className="preset-manage-button"
        type="button"
        disabled={!panelId}
        onClick={onManage}
      >
        <SlidersHorizontal size={15} />
        Manage presets
      </button>
    </div>,
    toolbar,
  );
}
function PresetModal({ state, presets, activePresetId, onClose, onRename, onRequestRename, onDelete, onSelect }: PresetModalProps) {
  const activePreset = state.mode === 'manage'
    ? null
    : presets.find((preset) => preset.id === state.presetId) ?? null;
  const [name, setName] = useState(activePreset?.name ?? '');

  useEffect(() => {
    setName(activePreset?.name ?? '');
  }, [activePreset?.id, activePreset?.name]);

  const closeModal = () => {
    if (state.mode === 'create') onDelete(state.panelId, state.presetId);
    onClose();
  };

  const submitName = (event: FormEvent) => {
    event.preventDefault();
    if (state.mode === 'manage') return;
    const nextName = name.trim();
    if (!nextName) return;
    onRename(state.panelId, state.presetId, nextName);
    onClose();
  };

  return (
    <div className="preset-modal-backdrop" role="presentation" onMouseDown={closeModal}>
      <section
        className="preset-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preset-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="preset-modal-header">
          <div>
            <h2 id="preset-modal-title">{state.mode === 'manage' ? 'Presets' : state.mode === 'create' ? 'Name preset' : 'Rename preset'}</h2>
            <p>{state.mode === 'manage' ? 'Saved locally in this browser.' : 'Choose a name for this saved parameter set.'}</p>
          </div>
          <button className="preset-icon-button" type="button" onClick={closeModal} aria-label="Close preset modal">
            <X size={16} />
          </button>
        </header>

        {state.mode === 'manage' ? (
          <div className="preset-list">
            {presets.length ? presets.map((preset) => (
              <div className="preset-list-item" key={preset.id} data-active={String(preset.id === activePresetId)}>
                <button className="preset-list-name" type="button" onClick={() => onSelect(state.panelId, preset.id)}>
                  <span>{preset.name}</span>
                  {preset.id === activePresetId ? <small>Active</small> : null}
                </button>
                <div className="preset-list-actions">
                  <button
                    className="preset-icon-button"
                    type="button"
                    onClick={() => onRequestRename(state.panelId, preset.id)}
                    aria-label={`Rename ${preset.name}`}
                    data-action="rename"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="preset-icon-button"
                    type="button"
                    onClick={() => onDelete(state.panelId, preset.id)}
                    aria-label={`Delete ${preset.name}`}
                    data-action="delete"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            )) : <div className="preset-empty">No saved presets yet.</div>}
          </div>
        ) : (
          <form className="preset-name-form" onSubmit={submitName}>
            <label htmlFor="preset-name-input">Preset name</label>
            <input
              id="preset-name-input"
              autoFocus
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              placeholder="Preset name"
            />
            <div className="preset-modal-footer">
              <button className="preset-secondary-button" type="button" onClick={closeModal}>Cancel</button>
              <button className="preset-primary-button" type="submit" disabled={!name.trim()}>
                <Check size={15} />
                Save
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
function Lab() {
  const [bindingsSource, setBindingsSource] = useState<BindingsSource>('noise');
  const [renderMode, setRenderMode] = useState<'flat' | 'terrain'>('flat');
  const [svgNoiseEnabled, setSvgNoiseEnabled] = useState(false);
  const [svgMode, setSvgMode] = useState<SvgMode>('2d');
  const [pathEnabled, setPathEnabled] = useState(true);
  const [paths, setPaths] = useState<CompositionPath[]>(() => [createDefaultPath(1)]);
  const [activePathId, setActivePathId] = useState(() => paths[0]?.id ?? 'path-1');
  const [selectedPathPoint, setSelectedPathPoint] = useState<SelectedPathPoint | null>(null);
  const [pathManagerHost, setPathManagerHost] = useState<HTMLElement | null>(null);
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
  const activePath = paths.find((path) => path.id === activePathId) ?? paths[0];
  const activePathMode = activePath?.mode ?? 'auto';
  const config = useMemo(
    () => createDialConfig(bindingsSource, renderMode, svgNoiseEnabled, svgMode, videoDuration, pathEnabled, activePathMode, gradientStopCount, gradientEditEnabled, colorMode, gradientType),
    [activePathMode, bindingsSource, colorMode, gradientEditEnabled, gradientStopCount, gradientType, pathEnabled, renderMode, svgMode, svgNoiseEnabled, videoDuration],
  );
  const panelName = 'TrueCourse Patterns';
  const [presetRevision, setPresetRevision] = useState(0);
  const [presetModal, setPresetModal] = useState<PresetModalState | null>(null);
  const presetPanel = DialStore.getPanels().find((item) => item.name === panelName);
  const presetPanelId = presetPanel?.id ?? null;
  const presets = presetPanelId ? DialStore.getPresets(presetPanelId) : [];
  const activePresetId = presetPanelId ? DialStore.getActivePresetId(presetPanelId) : null;
  void presetRevision;

  useEffect(() => {
    installPresetSavePatch(panelName);

    let unsubscribePanel: (() => void) | null = null;
    let unsubscribeGlobal: (() => void) | null = null;
    let hydrated = false;

    const initializePresetStorage = () => {
      const panel = DialStore.getPanels().find((item) => item.name === panelName);
      if (!panel) return false;

      if (!hydrated) {
        hydrateStoredPresetState(panel.id, panelName);
        hydrated = true;
      }

      unsubscribePanel?.();
      unsubscribePanel = DialStore.subscribe(panel.id, () => {
        saveStoredPresetState(panel.id, panelName);
        setPresetRevision((value) => value + 1);
      });
      saveStoredPresetState(panel.id, panelName);
      setPresetRevision((value) => value + 1);
      return true;
    };

    const handlePresetCreated = (event: Event) => {
      const detail = (event as CustomEvent<{ panelId: string; presetId: string }>).detail;
      if (!detail?.panelId || !detail.presetId) return;
      setPresetModal({ mode: 'create', panelId: detail.panelId, presetId: detail.presetId });
    };

    window.addEventListener('truecourse:preset-created', handlePresetCreated);

    if (!initializePresetStorage()) {
      unsubscribeGlobal = DialStore.subscribeGlobal(() => {
        if (initializePresetStorage()) {
          unsubscribeGlobal?.();
          unsubscribeGlobal = null;
        }
      });
    }

    return () => {
      unsubscribePanel?.();
      unsubscribeGlobal?.();
      window.removeEventListener('truecourse:preset-created', handlePresetCreated);
    };
  }, [panelName]);

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
        if (action === 'Path.clearPoints' || action === 'clearPoints') {
          setPaths((items) => items.map((item) => (item.id === activePathId ? { ...item, points: [] } : item)));
          setSelectedPathPoint(null);
        }
        if (action === 'Export.exportPng' || action === 'exportPng') setPendingExport(true);
        if (action === 'Export.exportMp4' || action === 'exportMp4') setVideoExportNonce((value) => value + 1);
      },
    },
  ) as unknown as LabControls;

  const updateTerrainCameraControl = (change: TerrainCameraControlChange) => {
    const panel = DialStore.getPanels().find((item) => item.name === panelName);
    if (!panel) return;
    DialStore.updateValue(panel.id, `Camera.${change.key}`, Number(change.value.toFixed(3)));
  };
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
    const nextRenderMode = controls.Bindings?.renderMode === 'terrain' ? 'terrain' : 'flat';
    if (nextRenderMode !== renderMode) setRenderMode(nextRenderMode);
  }, [controls.Bindings?.renderMode, renderMode]);

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
    setPaths((items) => items.map((item) => (item.id === activePathId && item.mode !== nextPathMode ? { ...item, mode: nextPathMode } : item)));
    if (nextPathMode !== 'manual') setSelectedPathPoint(null);
  }, [activePathId, controls.Path?.mode]);

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
    return createBindingsSettings(controls, seed, videoExportNonce, svgDataUrl, videoDataUrl, imageDataUrl, videoDuration, paths, activePathId, selectedPathPoint, gradientStopCount, gradientEditEnabled, colorMode, gradientType, gradientVector);
  }, [activePathId, colorMode, controls, gradientEditEnabled, gradientStopCount, gradientType, gradientVector, imageDataUrl, nonce, paths, selectedPathPoint, svgDataUrl, videoDataUrl, videoDuration, videoExportNonce]);

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

  const commitPresetRename = (panelId: string, presetId: string, name: string) => {
    renamePreset(panelId, presetId, name);
    saveStoredPresetState(panelId, panelName);
    setPresetRevision((value) => value + 1);
  };

  const deletePreset = (panelId: string, presetId: string) => {
    DialStore.deletePreset(panelId, presetId);
    saveStoredPresetState(panelId, panelName);
    setPresetRevision((value) => value + 1);
  };

  const selectPreset = (panelId: string, presetId: string) => {
    DialStore.loadPreset(panelId, presetId);
    saveStoredPresetState(panelId, panelName);
    setPresetRevision((value) => value + 1);
  };

  const requestPresetRename = (panelId: string, presetId: string) => {
    setPresetModal({ mode: 'rename', panelId, presetId });
  };
  const setActivePathPoints = (update: PathWaypoint[] | ((points: PathWaypoint[]) => PathWaypoint[])) => {
    setPaths((items) => items.map((item) => {
      if (item.id !== activePathId) return item;
      const nextPoints = typeof update === 'function' ? update(item.points) : update;
      return { ...item, points: nextPoints };
    }));
  };

  const updateDialPathMode = (mode: 'auto' | 'manual') => {
    const panel = DialStore.getPanels().find((item) => item.name === panelName);
    if (panel) DialStore.updateValue(panel.id, 'Path.mode', mode);
  };

  const selectPath = (pathId: string) => {
    const nextPath = paths.find((item) => item.id === pathId);
    if (!nextPath) return;
    setActivePathId(pathId);
    setSelectedPathPoint(null);
    updateDialPathMode(nextPath.mode);
  };

  const addPath = () => {
    const nextPath = createDefaultPath(paths.length + 1);
    setPaths((items) => [...items, nextPath]);
    setActivePathId(nextPath.id);
    setSelectedPathPoint(null);
    updateDialPathMode(nextPath.mode);
  };

  const deletePath = (pathId: string) => {
    if (paths.length <= 1) return;
    const activeIndex = paths.findIndex((item) => item.id === pathId);
    const nextItems = paths.filter((item) => item.id !== pathId);
    setPaths(nextItems);
    if (pathId === activePathId) {
      const nextPath = nextItems[Math.max(0, Math.min(activeIndex, nextItems.length - 1))];
      if (nextPath) {
        setActivePathId(nextPath.id);
        updateDialPathMode(nextPath.mode);
      }
      setSelectedPathPoint(null);
    } else if (selectedPathPoint?.pathId === pathId) {
      setSelectedPathPoint(null);
    }
  };

  useEffect(() => {
    let frame = 0;
    let timeout = 0;
    let observer: MutationObserver | null = null;
    let attempts = 0;

    const mountPathManager = () => {
      const rail = document.querySelector<HTMLElement>('.control-rail');
      const folders = Array.from(document.querySelectorAll<HTMLElement>('.control-rail .dialkit-folder'));
      const pathFolder = folders.find((folder) => folder.querySelector('.dialkit-folder-title')?.textContent?.trim() === 'Path');
      const pathInner = pathFolder?.querySelector<HTMLElement>(':scope > .dialkit-folder-content > .dialkit-folder-inner');

      if (!pathInner) {
        attempts += 1;
        if (attempts < 20) timeout = window.setTimeout(mountPathManager, 50);
        if (rail && !observer) {
          observer = new MutationObserver(mountPathManager);
          observer.observe(rail, { childList: true, subtree: true });
        }
        return;
      }

      let mount = pathInner.querySelector<HTMLElement>(':scope > .path-manager-mount');
      if (!mount) {
        mount = document.createElement('div');
        mount.className = 'path-manager-mount';
      }

      const rows = Array.from(pathInner.children) as HTMLElement[];
      const anchor = rows.find((row) => row.textContent?.trim() === 'Clear Points')
        ?? rows.find((row) => row.textContent?.trim().startsWith('Mode'));
      if (anchor?.nextSibling !== mount) {
        pathInner.insertBefore(mount, anchor ? anchor.nextSibling : pathInner.firstChild);
      }
      if (!observer) {
        observer = new MutationObserver(() => {
          window.requestAnimationFrame(mountPathManager);
        });
        observer.observe(pathInner, { childList: true });
      }
      setPathManagerHost(mount);
    };

    frame = window.requestAnimationFrame(mountPathManager);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
      observer?.disconnect();
    };
  }, [activePathMode, pathEnabled]);

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
          onPathPointsChange={setActivePathPoints}
          onSelectedPathPointChange={setSelectedPathPoint}
          onGradientControlChange={updateGradientControl}
          onTerrainCameraChange={updateTerrainCameraControl}
        />
      </section>

      <aside className="control-rail">
        <DialRoot mode="inline" theme="dark" productionEnabled />
        {pathManagerHost ? createPortal(
          <div className="path-manager">
            <div className="path-manager-header">
              <span>Paths</span>
              <button className="path-add-button" type="button" onClick={addPath} title="Add path" aria-label="Add path">
                <Plus size={14} />
                Add
              </button>
            </div>
            <div className="path-list">
              {paths.map((path) => {
                const isActive = path.id === activePathId;
                const detail = path.mode === 'manual' ? `${path.points.length} dots` : 'Auto route';
                return (
                  <div className="path-list-row" data-active={isActive} key={path.id}>
                    <button className="path-row-select" type="button" onClick={() => selectPath(path.id)} aria-pressed={isActive}>
                      <span>{path.name}</span>
                      <small>{detail}</small>
                    </button>
                    <button
                      className="path-icon-button"
                      type="button"
                      onClick={() => deletePath(path.id)}
                      title={`Delete ${path.name}`}
                      aria-label={`Delete ${path.name}`}
                      disabled={paths.length <= 1}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="path-manager-meta">
              <span>{selectedPathPoint?.pathId === activePathId ? `Dot ${selectedPathPoint.index + 1} selected` : 'No dot selected'}</span>
            </div>
          </div>,
          pathManagerHost,
        ) : null}
        <PresetManageButton
          panelId={presetPanelId}
          onManage={() => presetPanelId && setPresetModal({ mode: 'manage', panelId: presetPanelId })}
        />
      </aside>

      {presetModal ? (
        <PresetModal
          state={presetModal}
          presets={presets}
          activePresetId={activePresetId}
          onClose={() => setPresetModal(null)}
          onRename={commitPresetRename}
          onRequestRename={requestPresetRename}
          onDelete={deletePreset}
          onSelect={selectPreset}
        />
      ) : null}
    </main>
  );
}

export default function App() {
  return <Lab />;
}

