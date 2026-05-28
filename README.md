# TrueCourse Pattern Lab

Interactive generative pattern tool for exploring fine-line molecular, biological, cartographic, and decision-path brand systems.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite, usually:

```bash
http://127.0.0.1:5173/
```

## Build

```bash
npm run build
```

## Notes

- Built with React, TypeScript, Vite, Canvas, and DialKit.
- Controls live in the right-side DialKit rail.
- The artwork is kept as a vector graph so the same nodes and edges can render to Canvas, PNG, and SVG.
- SVG uploads are sampled into contour points and an alpha mask for inside/outside/contour-aware generation.
