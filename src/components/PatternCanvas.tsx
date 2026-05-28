import { useEffect, useRef } from 'react';
import type { GeneratedPattern, PatternSettings, UploadedShape } from '../types/pattern';
import { renderPatternToCanvas } from '../rendering/renderPattern';
import { renderPatternToWebgl } from '../rendering/renderPatternWebgl';

type PatternCanvasProps = {
  pattern: GeneratedPattern;
  settings: PatternSettings;
  shape: UploadedShape | null;
};

export function PatternCanvas({ pattern, settings, shape }: PatternCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const rendered = renderPatternToWebgl(canvasRef.current, pattern, settings);
    if (!rendered) renderPatternToCanvas(canvasRef.current, pattern, settings, shape);
  }, [pattern, settings, shape]);

  return (
    <div className="preview-stage">
      <canvas
        ref={canvasRef}
        className="pattern-canvas"
        width={settings.width}
        height={settings.height}
        aria-label="Generated molecular network pattern preview"
      />
    </div>
  );
}
