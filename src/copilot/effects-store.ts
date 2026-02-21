export type FrameStyle = "simple" | "ornate" | "double";

export type PlaneFrame = {
  style: FrameStyle;
  color: string;
  width: number;
};

export type OverlayType = "sparkles" | "stars" | "dust";

export type PlaneOverlay = {
  type: OverlayType;
  density: number;
  color: string;
};

export type FilterType = "grayscale" | "sepia" | "invert" | "saturate" | "warm" | "cool" | "vintage" | "brightness" | "contrast";

export type PlaneFilter = {
  type: FilterType;
  intensity: number;
};

export type EffectsState = {
  frames: Map<string, PlaneFrame>;
  overlays: Map<string, PlaneOverlay>;
  filters: Map<string, PlaneFilter>;
  revision: number;
};

export function createEffectsState(): EffectsState {
  return {
    frames: new Map(),
    overlays: new Map(),
    filters: new Map(),
    revision: 0,
  };
}
