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

export type EffectsState = {
  frames: Map<string, PlaneFrame>;
  overlays: Map<string, PlaneOverlay>;
  revision: number;
};

export function createEffectsState(): EffectsState {
  return {
    frames: new Map(),
    overlays: new Map(),
    revision: 0,
  };
}
