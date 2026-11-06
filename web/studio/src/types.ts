export interface Bone {
  name: string;
  parent?: string;
  x?: number;
  y?: number;
  rotation?: number;
  length?: number;
}

export interface TimelineKey {
  time?: number;
  angle?: number;
  value?: number;
  x?: number;
  y?: number;
  vertices?: number[];
}

export interface Animation {
  bones?: Record<string, Record<string, TimelineKey[]>>;
  slots?: Record<string, Record<string, TimelineKey[]>>;
  deform?: Record<string, Record<string, Record<string, TimelineKey[]>>>;
}

export interface Skeleton {
  bones: Bone[];
  slots: { name: string; bone: string; attachment: string }[];
  animations: Record<string, Animation>;
}

export interface Part {
  name: string;
  parent: string | null;
  depth: number;
  bbox: { x: number; y: number; width: number; height: number };
  pivot: { x: number; y: number };
}

export interface ExportFile { name: string; url: string; kind: string }

export interface Manifest {
  id: string;
  revision?: string;
  project: string;
  name: string;
  title?: string;
  createdAt: string;
  target: { id: string; label: string; spine: string };
  imageSize: { width: number; height: number };
  inputUrl?: string;
  sourceUrl: string;
  bones: number;
  partCount?: number;
  slots: number;
  animations: { name: string; duration: number }[];
  blink: boolean;
  loop: boolean;
  warnings: string[];
  files: ExportFile[];
  segmentation?: { backend: string };
  transparency?: {
    after: { hasClearBackground: boolean; meaningfulAlpha: boolean };
    correctedEdgePixels?: number;
    spillBefore?: number;
    spillAfter?: number;
  };
}

export interface ProjectData {
  manifest: Manifest;
  preview: {
    skeleton: Skeleton;
    imageSize: { width: number; height: number };
    imageUrls: [string, string][];
    sourceUrl: string;
    analysis?: { parts?: Part[] };
    alignment?: unknown[];
  };
}

export type Background = 'dark' | 'light' | 'checker';
export interface ViewSettings {
  background: Background;
  bones: boolean;
  wireframe: boolean;
  zoom: number;
  speed: number;
  loop: boolean;
  selectedBone: string | null;
}

export interface TimelineTrack { id: string; bone: string; label: string; channel: string; times: number[] }

const channelNames: Record<string, string> = { rotate: '旋转', translate: '位置', scale: '缩放', alpha: '透明度', color: '颜色', rgba: '颜色' };

export function animationTracks(animation?: Animation): TimelineTrack[] {
  if (!animation) return [];
  const tracks: TimelineTrack[] = [];
  for (const [bone, channels] of Object.entries(animation.bones || {})) {
    for (const [channel, keys] of Object.entries(channels)) {
      tracks.push({ id: `${bone}:${channel}`, bone, label: channelNames[channel] || channel, channel,
        times: [...new Set(keys.map((key) => key.time || 0))] });
    }
  }
  for (const slots of Object.values(animation.deform || {})) {
    for (const [slot, attachments] of Object.entries(slots)) {
      for (const [attachment, keys] of Object.entries(attachments)) {
        tracks.push({ id: `${slot}:${attachment}`, bone: slot.replace(/_slot$/, ''), label: '网格形变', channel: 'deform',
          times: [...new Set(keys.map((key) => key.time || 0))] });
      }
    }
  }
  return tracks;
}

export function friendlyBone(name: string): string {
  const names: Record<string, string> = { root: '根骨骼', body: '躯干', torso: '躯干', head: '头部', hair: '头发',
    pelvis: '骨盆', left_arm: '左臂', right_arm: '右臂', left_leg: '左腿', right_leg: '右腿',
    upper_arm_left: '左上臂', upper_arm_right: '右上臂', forearm_left: '左前臂', forearm_right: '右前臂' };
  return names[name] || name;
}

export function shortTarget(target?: Manifest['target']): string {
  return target?.id === 'unity' ? 'Unity' : target?.id === 'cocos-3.8' ? 'Cocos Creator' : target?.label || '—';
}

export function timecode(value: number, fps = 30): string {
  const frames = Math.max(0, Math.round(value * fps));
  return [Math.floor(frames / fps / 60), Math.floor(frames / fps) % 60, frames % fps]
    .map((part) => String(part).padStart(2, '0')).join(':');
}
