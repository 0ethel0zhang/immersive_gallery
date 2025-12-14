import { run } from "~/src/utils";

export const CHUNK_SIZE = 110;
export const ITEMS_PER_CHUNK = 5;
export const RENDER_DISTANCE = 2;
export const CHUNK_FADE_MARGIN = 1;
export const MAX_VELOCITY = 3.2;
export const VISIBILITY_LERP = 0.18;
export const DEPTH_FADE_START = 140;
export const DEPTH_FADE_END = 260;
export const MAX_DIST = RENDER_DISTANCE + CHUNK_FADE_MARGIN;

export const INVIS_THRESHOLD = 0.01;
export const FULL_OPACITY_THRESHOLD = 0.99;
export const DEPTH_FADE_EXTRA = 50;

export const MOUSE_DRAG_SENSITIVITY = 0.025;
export const TOUCH_DRAG_SENSITIVITY = 0.02;
export const WHEEL_SCROLL_SENSITIVITY = 0.006;
export const TOUCH_PINCH_SENSITIVITY = 0.006;
export const SCROLL_ACCUM_DECAY = 0.8;

export const KEYBOARD_SPEED = 0.18;
export const SPACE_SPEED_MULTIPLIER = 1.5;
export const ZOOMING_THRESHOLD = 0.05;

export const MAX_DRIFT = 8.0;
export const ZOOM_FACTOR_MIN = 0.3;
export const ZOOM_FACTOR_MAX = 2.0;
export const ZOOM_FACTOR_BASE = 50;
export const DRIFT_LERP_ZOOMING = 0.2;
export const DRIFT_LERP_NORMAL = 0.12;

export const VELOCITY_LERP = 0.16;
export const VELOCITY_DECAY = 0.9;

export const FPS_UPDATE_INTERVAL = 400;
export const READY_DELAY = 50;
export const INITIAL_CAMERA_Z = 50;
export const IDLE_CALLBACK_TIMEOUT = 100;

export const DPR_MAX_TOUCH = 1.25;
export const DPR_MAX_DESKTOP = 1.5;

export type ChunkOffset = {
  dx: number;
  dy: number;
  dz: number;
  dist: number;
};

export const CHUNK_OFFSETS: ChunkOffset[] = run(() => {
  const offsets: ChunkOffset[] = [];
  for (let dx = -MAX_DIST; dx <= MAX_DIST; dx++) {
    for (let dy = -MAX_DIST; dy <= MAX_DIST; dy++) {
      for (let dz = -MAX_DIST; dz <= MAX_DIST; dz++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
        if (dist > MAX_DIST) continue;
        offsets.push({ dx, dy, dz, dist });
      }
    }
  }
  return offsets;
});
