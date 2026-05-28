import { useEffect, useMemo, useState } from 'react';
import { DialRoot, useDialKit } from 'dialkit';
import 'dialkit/styles.css';
import './App.css';
import { NoiseCanvas, type NoiseSettings } from './components/NoiseCanvas';

const defaultSeed = 'TC-48291';

function randomSeed() {
  return `TC-${Math.floor(10000 + Math.random() * 89999)}`;
}

function useDebouncedValue<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);

  return debounced;
}

function Lab() {
  const [seedOverride, setSeedOverride] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [pendingExport, setPendingExport] = useState(false);
  const [videoExportNonce, setVideoExportNonce] = useState(0);

  const controls = useDialKit(
    'Noise Field',
    {
      refresh: { type: 'action', label: 'Refresh' },
      randomize: { type: 'action', label: 'Randomize Seed' },
      reset: { type: 'action', label: 'Reset' },
      Noise: {
        seed: { type: 'text', default: defaultSeed },
        size: [0.42, 0.05, 1, 0.01],
        complexity: [0.5, 0, 1, 0.01],
        contrast: [0.58, 0, 1, 0.01],
        brightness: [0.48, 0, 1, 0.01],
        showMap: false,
        nodeDensity: [0.64, 0.05, 1, 0.01],
        connectionDensity: [0.74, 0, 1, 0.01],
        angleBias: [0.82, 0, 1, 0.01],
        organicity: [0.42, 0, 1, 0.01],
        nodeSize: [0.86, 0.2, 2.4, 0.02],
        lineWidth: [0.58, 0.12, 2.4, 0.02],
        backgroundColor: '#041426',
        lineColor: '#7DB2FF',
        nodeColor: '#D9EAFF',
      },
      Path: {
        enabled: true,
        thickness: [1.35, 0.4, 8, 0.1],
        endpointSpread: [0.72, 0, 1, 0.01],
        color: '#FFFFFF',
      },
      Motion: {
        enabled: false,
        loopDuration: [8, 2, 30, 0.5],
        amount: [0.38, 0, 1, 0.01],
        frameRate: [30, 6, 30, 1],
      },
      Export: {
        transparentBackground: false,
        exportPng: { type: 'action', label: 'Export PNG' },
        exportMp4: { type: 'action', label: 'Export MP4' },
        width: [1440, 640, 2400, 10],
        height: [900, 480, 1800, 10],
      },
    },
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
  );

  const settings: NoiseSettings = useMemo(() => {
    const noise = controls.Noise;
    const path = controls.Path;
    const motion = controls.Motion;
    const exportControls = controls.Export;
    return {
      seed: `${seedOverride ?? noise.seed}:${nonce}`,
      size: noise.size,
      complexity: noise.complexity,
      contrast: noise.contrast,
      brightness: noise.brightness,
      showMap: noise.showMap,
      nodeDensity: noise.nodeDensity,
      connectionDensity: noise.connectionDensity,
      angleBias: noise.angleBias,
      organicity: noise.organicity,
      nodeSize: noise.nodeSize,
      lineWidth: noise.lineWidth,
      backgroundColor: noise.backgroundColor,
      lineColor: noise.lineColor,
      nodeColor: noise.nodeColor,
      pathEnabled: path.enabled,
      pathThickness: path.thickness,
      pathEndpointSpread: path.endpointSpread,
      pathColor: path.color,
      motionEnabled: motion.enabled,
      loopDuration: motion.loopDuration,
      motionAmount: motion.amount,
      frameRate: Math.round(motion.frameRate),
      transparentBackground: exportControls.transparentBackground,
      videoExportNonce,
      width: Math.round(exportControls.width),
      height: Math.round(exportControls.height),
    };
  }, [controls.Export, controls.Motion, controls.Noise, controls.Path, nonce, seedOverride, videoExportNonce]);

  const debouncedSettings = useDebouncedValue(settings, 35);

  useEffect(() => {
    if (!pendingExport) return;
    const canvas = document.querySelector<HTMLCanvasElement>('.noise-canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `truecourse-pattern-${debouncedSettings.seed.replace(/[^a-z0-9-]/gi, '-')}.png`;
    link.click();
    setPendingExport(false);
  }, [debouncedSettings.seed, pendingExport]);

  return (
    <main className="app-shell">
      <section className="work-area">
        <NoiseCanvas settings={debouncedSettings} />
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
