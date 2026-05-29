import { useEffect, useMemo, useState } from 'react';
import { DialRoot, useDialKit, type DialConfig } from 'dialkit';
import 'dialkit/styles.css';
import './App.css';
import { BlobsCanvas, type BlobsSettings } from './components/BlobsCanvas';
import { NoiseCanvas, type NoiseSettings } from './components/NoiseCanvas';

const defaultSeed = 'TC-48291';

type ShaderMode = 'bindings' | 'blobs';
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
    size: number;
    complexity: number;
    contrast: number;
    brightness: number;
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
    loopDuration: number;
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

function slider(defaultValue: number, min: number, max: number, step: number): [number, number, number, number] {
  return [defaultValue, min, max, step];
}

function createDialConfig(shaderMode: ShaderMode): DialConfig {
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
            size: slider(0.42, 0.05, 1, 0.01),
            complexity: slider(0.5, 0, 1, 0.01),
            contrast: slider(0.58, 0, 1, 0.01),
            brightness: slider(0.48, 0, 1, 0.01),
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
      loopDuration: slider(8, 2, 30, 0.5),
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

function createBindingsSettings(
  controls: LabControls,
  seed: string,
  videoExportNonce: number,
): NoiseSettings {
  const bindings = controls.Bindings;
  const path = controls.Path;
  const motion = controls.Motion;
  const exportControls = controls.Export;

  return {
    seed,
    size: bindings?.size ?? 0.42,
    complexity: bindings?.complexity ?? 0.5,
    contrast: bindings?.contrast ?? 0.58,
    brightness: bindings?.brightness ?? 0.48,
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
    loopDuration: motion.loopDuration,
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
    loopDuration: motion.loopDuration,
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
  const [seedOverride, setSeedOverride] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [pendingExport, setPendingExport] = useState(false);
  const [videoExportNonce, setVideoExportNonce] = useState(0);
  const config = useMemo(() => createDialConfig(shaderMode), [shaderMode]);

  const controls = useDialKit(
    'Noise Field',
    config,
    {
      onAction: (action) => {
        if (action === 'refresh') setNonce((value) => value + 1);
        if (action === 'randomize') {
          setSeedOverride(randomSeed());
          setNonce((value) => value + 1);
        }
        if (action === 'reset') window.location.reload();
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

  const settings: LabSettings = useMemo(() => {
    const seed = `${seedOverride ?? controls.Shader.seed}:${nonce}`;
    return shaderMode === 'blobs'
      ? { mode: 'blobs', values: createBlobsSettings(controls, seed, videoExportNonce) }
      : { mode: 'bindings', values: createBindingsSettings(controls, seed, videoExportNonce) };
  }, [controls, nonce, seedOverride, shaderMode, videoExportNonce]);

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
