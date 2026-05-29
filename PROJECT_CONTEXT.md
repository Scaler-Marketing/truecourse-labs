# TrueCourse Labs Project Context

Last scanned: 2026-05-28

This file is a working map for future Codex sessions. Read this before making changes so you do not need to rediscover the whole repo from scratch.

## Project Summary

TrueCourse Labs is a Vite + React + TypeScript generative pattern lab. The current UI renders a full-screen generative artwork with a right-side DialKit control rail. Users can switch between shader modes, tune seed and mode-specific variables, control motion, set canvas size/colors, and export still PNG or looped video.

The current app entry path is:

- `src/main.tsx` mounts `App`.
- `src/App.tsx` builds DialKit controls, maps them into mode-specific settings, debounces `{ mode, values }`, and renders either `NoiseCanvas` or `BlobsCanvas`.
- `src/components/NoiseCanvas.tsx` owns the `bindings` generation, WebGL rendering, animation loop, PNG target canvas, and MP4/WebM export path.
- `src/components/BlobsCanvas.tsx` owns the `blobs` shader, WebGL rendering, rotation animation loop, PNG target canvas, and MP4/WebM export path.

## Stack And Commands

- Framework: React 18, TypeScript, Vite.
- UI controls: `dialkit` via `DialRoot` and `useDialKit`.
- Icons dependency exists: `lucide-react`, but it is not currently used.
- Motion dependency exists: `motion`, but it is not currently used.
- Rendering: direct Canvas/WebGL APIs, no Three.js.

Common commands:

```bash
npm run dev
npm run build
npm run lint
npm run preview
```

On Windows/Codex, prefer `.cmd` shims if wrappers are blocked:

```powershell
npm.cmd run build
npm.cmd run lint
```

## Active UI Flow

`src/App.tsx` is the control/state layer.

- `defaultSeed` is `TC-48291`.
- `randomSeed()` generates `TC-#####`.
- `useDialKit('Noise Field', ...)` defines all controls.
- `Shader.mode` selects `bindings` or `blobs`.
- `Shader.seed` is shared across shader modes.
- Mode-specific groups are conditional: `Bindings` + `Path` for `bindings`; `Blobs` for `blobs`.
- Shared groups are `Motion` and `Export`.
- Settings are memoized as `{ mode, values }` and debounced by `35ms` before rendering/export. Keep mode and values coupled so `BlobsCanvas` never receives stale `NoiseSettings` during mode switches.
- `refresh` increments `nonce`, which is appended to the seed.
- `randomize` sets a new seed override and increments `nonce`.
- `reset` reloads the page.
- `Export.exportPng` triggers a `toDataURL('image/png')` download from the active `.lab-canvas`.
- `Export.exportMp4` increments `videoExportNonce`; the active canvas component observes it and records a loop with `MediaRecorder`.

The layout is intentionally minimal:

- `.app-shell` is a two-column full-viewport grid.
- left side is `.work-area`, full bleed canvas.
- right side is `.control-rail`, fixed at `318px`.
- at widths below `980px`, controls move below the canvas as a `42vh` row.

## Bindings Generation And Rendering

`src/components/NoiseCanvas.tsx` is the `bindings` shader, originally V1 of the lab.

Important types:

- `NoiseSettings`: public prop contract from `App`.
- `PoolNode`: generated node with stable gate, base noise weight, morph weights, and optional stub geometry.
- `PoolEdge`: generated edge between two pool nodes with gate, angle score, base weight, and morph weights.
- `PatternPool`: generated nodes, edges, and highlighted path edge ids.
- `GlBundle`: WebGL context, shader programs, attribute locations, and uniforms.

Core pipeline:

1. `hashSeed(settings.seed)` creates deterministic randomness.
2. `buildPatternPool(settings)` creates a jittered grid of candidate nodes, spatial buckets, direction-aware edges, and optional path edges.
3. `buildFrameGeometry(pool, settings, phase)` filters active nodes/edges for the current noise/motion phase and builds line/point vertex arrays.
4. `renderWebgl(bundle, pool, settings, phase)` clears the canvas, optionally draws the noise map texture, then draws base lines, stubs, path lines, nodes, and stub nodes.
5. `NoiseCanvas` creates one WebGL bundle on mount, rebuilds the pattern pool when settings change, and only runs `requestAnimationFrame` when `motionEnabled` is true.

Noise and motion notes:

- Static noise uses local value noise helpers in `NoiseCanvas.tsx`.
- Motion morphs between four precomputed noise weights per node/edge/stub.
- `motionAmount` controls blend strength; `loopDuration` controls the phase cycle.
- `frameRate` throttles the animation loop and is also used for video export.

Path notes:

- `pathEnabled` controls whether `findPoolPathEdges` runs.
- Endpoints are chosen by farthest distance from a filtered node pool.
- Path is found with a simple Dijkstra-style traversal over generated edges.
- Path drawing uses `pathThickness` and `pathColor`.

Export notes:

- PNG export uses the visible `.noise-canvas`; WebGL uses `preserveDrawingBuffer: true` for readback.
- Video export creates an offscreen canvas and WebGL bundle, records with `canvas.captureStream(fps)`, drives frames manually, and downloads `mp4` if supported, otherwise `webm`.
- `preferredVideoMimeType()` tries MP4 first, then WebM.

## Blobs Generation And Rendering

`src/components/BlobsCanvas.tsx` is the V2 `blobs` shader.

Important types:

- `BlobsSettings`: prop contract from `App`.
- `BlobLine`: deterministic line definition with normal, offset, phase, and rotation amplitude.
- `GlBundle`: WebGL context, shader program, uniform locations, and static full-screen quad buffer.

Core pipeline:

1. `buildBlobLines(settings)` uses `createRng(settings.seed)` to create deterministic line cuts.
2. The fragment shader evaluates a signed-distance field for wide line strips.
3. Line width is kept mostly uniform by using strip SDFs with a bounded smooth-union at intersections; `cornerRadius` should be strongly responsive, with a loose cap high enough to make large rounded cuts visible without creating circular nodes.
4. Avoid full SDF disks at intersections; that creates visible circular nodes/balls instead of clean rounded cuts.
5. Avoid pairwise corner patches based on two local strip distances; they create inward-facing cuts and intersection artifacts.
6. Anti-aliasing is intentionally tiny so the result reads as vector-clean instead of blurred.
7. Motion rotates each line around the canvas center using deterministic phase/amplitude values; it does not animate line width.

Blobs controls:

- `lineCount`: number of cutting lines, capped by `maxBlobLines` in `BlobsCanvas.tsx`.
- `lineWidth`: uniform blue corridor width.
- `cornerRadius`: extra rounded radius around line intersections.
- `angleSpread`: how far cuts can drift from snapped 45-degree families.
- `offsetJitter`: how widely lines are distributed and how much rotation amplitude varies.
- `backgroundColor`: line/corridor color.
- `blobColor`: filled shape color.

Blobs performance notes:

- Rendering is GPU fragment-shader based for animation performance.
- The only per-frame work is uniform upload and one full-screen quad draw.
- Keep `maxBlobLines` modest unless profiling proves higher counts are safe; nested intersection checks run in the fragment shader.
- Motion should remain rotation-based unless product direction changes.

## Legacy Or Secondary Pattern System

There is a second graph/rendering system that is currently not wired into `App.tsx`.

Files:

- `src/types/pattern.ts`
- `src/generation/geometry.ts`
- `src/generation/noiseField.ts`
- `src/generation/pattern.ts`
- `src/generation/random.ts`
- `src/generation/svgShape.ts`
- `src/components/PatternCanvas.tsx`
- `src/rendering/renderPattern.ts`
- `src/rendering/renderPatternWebgl.ts`

What it does:

- Defines `PatternSettings`, `GeneratedPattern`, `UploadedShape`, SVG shape modes, mask/contour handling, and generated graph data.
- `generatePattern()` builds a filament-style graph, bridges components, detects contour edges, and optionally highlights a course/path.
- `parseUploadedSvg()` samples SVG geometry into contour points and builds an alpha mask for inside/outside/contour-aware generation.
- `PatternCanvas` tries WebGL rendering first and falls back to Canvas 2D.
- `patternToSvg()` can export the generated pattern as SVG.

Current caution:

- The README still mentions SVG uploads and vector graph export, but the current visible app only exposes `NoiseCanvas` controls and PNG/video export.
- If adding SVG upload, SVG export, or shape-aware behavior, decide whether to revive this secondary system, port those capabilities into `NoiseCanvas`, or remove stale code after confirming scope.

## File Map

- `src/main.tsx`: React root setup.
- `src/App.tsx`: app state, DialKit controls, settings mapping, PNG export trigger, layout shell.
- `src/App.css`: app layout, canvas stage, right control rail, mobile layout.
- `src/index.css`: global base styles.
- `src/components/NoiseCanvas.tsx`: `bindings` generator, WebGL renderer, animation, PNG canvas target, loop video export.
- `src/components/BlobsCanvas.tsx`: `blobs` SDF shader, WebGL renderer, rotation animation, PNG canvas target, loop video export.
- `src/components/PatternCanvas.tsx`: secondary renderer component for `GeneratedPattern`, not used by current app.
- `src/generation/random.ts`: shared seed hashing and RNG helpers; used by both systems.
- `src/generation/pattern.ts`: secondary filament graph generator.
- `src/generation/noiseField.ts`: secondary noise sampler for `PatternSettings`.
- `src/generation/geometry.ts`: secondary geometry/path helpers.
- `src/generation/svgShape.ts`: secondary SVG upload parser and alpha-mask point checks.
- `src/rendering/renderPattern.ts`: secondary Canvas 2D and SVG export renderer.
- `src/rendering/renderPatternWebgl.ts`: secondary simplified WebGL renderer.
- `README.md`: project description and local run/build notes. Some notes describe the secondary system more than the currently visible UI.
- `dist/`: built output, generated by `npm run build`.
- `dev-server.log`: local server log artifact.

## Design And Product Intent

The app reads as an interactive brand/pattern lab rather than a landing page. Keep the first screen as the tool itself.

Current visual language:

- dark full-bleed work area.
- fine molecular/cartographic network lines.
- cool blue default line and node colors.
- white highlighted course path.
- utilitarian control rail.

Avoid adding marketing sections or explanatory in-app text unless explicitly requested. The right rail is the natural home for controls.

## Implementation Guidance

- When changing controls, update the DialKit schema in `App.tsx` and the relevant settings type: `NoiseSettings` in `NoiseCanvas.tsx` or `BlobsSettings` in `BlobsCanvas.tsx`.
- Keep `LabSettings` in `App.tsx` as `{ mode, values }`; this prevents stale settings from the previous shader mode being rendered during the debounce window.
- Keep generated artwork deterministic for a given `settings.seed`; random behavior should be derived from `hashSeed`.
- Be careful with WebGL resource churn. Rendering currently creates/deletes buffers per draw call and creates textures for the optional map overlay; for performance work, profile this area first.
- `buildPatternPool(settings)` can be expensive because it rebuilds all nodes/edges. Settings are debounced in `App.tsx`; preserve that or replace it with an intentional memoization strategy.
- Canvas display is stretched to fill the work area with CSS. Export dimensions come from `Export.width` and `Export.height`, not the browser viewport.
- `transparentBackground` affects WebGL clear alpha and exports, but the surrounding `.preview-stage` still has a CSS background.
- `lineWidth` in WebGL may have limited effect across browsers/platforms. If precise thick lines become important, implement geometry-based strokes instead of relying on `gl.lineWidth`.
- `MediaRecorder` MP4 support varies by browser. Keep WebM fallback unless product requirements say otherwise.
- Do not assume the secondary `PatternSettings` system is dead; it contains useful SVG/shape/export logic, but it is not the active UI path.

## Verification Checklist

For ordinary code changes:

```powershell
npm.cmd run build
npm.cmd run lint
```

For visual/rendering changes:

- Start Vite and inspect the actual browser surface.
- Check desktop and mobile widths because the control rail changes layout below `980px`.
- Test PNG export after any WebGL/canvas changes.
- Test video export after any motion/render loop changes.
- If touching transparent backgrounds, verify both visible preview and downloaded export.

For shape/SVG-related changes:

- Confirm whether the visible app is supposed to use the secondary `PatternCanvas`/`generatePattern` path or the active `NoiseCanvas` path.
- Test SVGs with and without `viewBox`.
- Test mask behavior and contour sampling in-browser, not only with TypeScript build.
