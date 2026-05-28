export type Point = {
  x: number;
  y: number;
};

export type Node = Point & {
  id: number;
  cluster: number;
  weight: number;
};

export type Edge = {
  id: number;
  a: number;
  b: number;
  distance: number;
  strength: number;
};

export type ShapeMode = 'free' | 'inside' | 'outside' | 'contour';

export type CanvasSize = {
  width: number;
  height: number;
};

export type PatternSettings = {
  seed: string;
  density: number;
  complexity: number;
  branching: number;
  lineThickness: number;
  nodeSize: number;
  noise: number;
  fieldScale: number;
  fieldThreshold: number;
  clusterScale: number;
  glowIntensity: number;
  backgroundColor: string;
  lineColor: string;
  highlightColor: string;
  width: number;
  height: number;
  highlightPath: boolean;
  pathThickness: number;
  pathGlow: number;
  pathSmoothness: number;
  pathColor: string;
  startEndRandomness: number;
  shapeMode: ShapeMode;
  maskToShape: boolean;
  showSvgGuide: boolean;
  contourDetectionDistance: number;
  contourHighlightThickness: number;
  contourHighlightGlow: number;
  contourHighlightColor: string;
  contourVisibilityStrength: number;
  transparentBackground: boolean;
  exportMultiplier: number;
};

export type UploadedShape = {
  source: string;
  fileName: string;
  contour: Point[];
  mask: HTMLCanvasElement;
  guideDataUrl: string;
};

export type GeneratedPattern = {
  nodes: Node[];
  edges: Edge[];
  highlightEdgeIds: Set<number>;
  contourEdgeIds: Set<number>;
  contourNodes: Set<number>;
  size: CanvasSize;
};
