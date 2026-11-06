export type Category = 'character' | 'prop' | 'effect' | 'item' | 'ui';
export interface Point { x: number; y: number }
export interface Box extends Point { width: number; height: number }
export interface Part {
  name: string;
  parent: string | null;
  depth: number;
  bbox: Box;
  pivot: Point;
  polygon?: Point[];
  occlusion_edges?: string[];
}
export interface AnalysisPlan {
  units: 'normalized' | 'pixels';
  category: Category;
  imageSize?: { width: number; height: number };
  parts: Part[];
}
export interface MotionKey { t: number; ease?: string; x?: number; y?: number; deg?: number; a?: number }
export interface MotionPlan {
  name?: string;
  duration?: number;
  loop?: boolean;
  none?: boolean;
  tracks?: { part: string; rotate?: MotionKey[]; translate?: MotionKey[]; scale?: MotionKey[]; alpha?: MotionKey[] }[];
}
export interface AlphaSnapshot {
  transparent: number; soft: number; opaque: number;
  transparentFraction: number; borderTransparentFraction: number;
  meaningfulAlpha: boolean; hasClearBackground: boolean;
}
export interface Manifest {
  version: 1;
  revision?: string;
  id: string;
  project: string;
  name: string;
  category: Category;
  createdAt: string;
  target: { id: string; label: string; spine: string };
  imageSize: { width: number; height: number };
  sourceUrl: string;
  inputUrl?: string;
  previewFile: string;
  bones: number;
  slots: number;
  partCount?: number;
  title?: string;
  segmentation?: import('./segmentation.js').SegmentationReport;
  transparency?: {
    before: AlphaSnapshot;
    after: AlphaSnapshot;
    mode?: 'auto' | 'transparent' | 'preserve';
    matte?: number[] | null;
    correctedEdgePixels?: number;
    spillBefore?: number;
    spillAfter?: number;
  };
  animations: { name: string; duration: number }[];
  blink: boolean;
  loop: boolean;
  warnings: string[];
  files: { name: string; url: string; kind: string }[];
}
