import type * as THREE from "three";

export type MediaItem = {
  url: string;
  width: number;
  height: number;
};

export type FocusColor = { r: number; g: number; b: number };

export type FocusEffectType = "fire" | "cloud" | "flowers";

export type InfiniteCanvasProps = {
  media: MediaItem[];
  onTextureProgress?: (progress: number) => void;
  onFocusChange?: (color: FocusColor | null, coverage: number) => void;
  focusEffectType?: FocusEffectType;
  showFps?: boolean;
  showControls?: boolean;
  cameraFov?: number;
  cameraNear?: number;
  cameraFar?: number;
  fogNear?: number;
  fogFar?: number;
  backgroundColor?: string;
  fogColor?: string;
};

export type ChunkData = {
  key: string;
  cx: number;
  cy: number;
  cz: number;
};

export type PlaneData = {
  id: string;
  position: THREE.Vector3;
  scale: THREE.Vector3;
  mediaIndex: number;
};
