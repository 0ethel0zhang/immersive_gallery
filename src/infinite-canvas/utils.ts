import * as THREE from "three";
import { hashString, seededRandom } from "~/src/utils";
import { CHUNK_SIZE } from "./constants";
import type { LayoutParams, PlaneData } from "./types";

const MAX_PLANE_CACHE = 256;
const planeCache = new Map<string, PlaneData[]>();

const touchPlaneCache = (key: string) => {
  const v = planeCache.get(key);
  if (!v) {
    return;
  }

  planeCache.delete(key);
  planeCache.set(key, v);
};

const evictPlaneCache = () => {
  while (planeCache.size > MAX_PLANE_CACHE) {
    const firstKey = planeCache.keys().next().value as string | undefined;
    if (!firstKey) break;
    planeCache.delete(firstKey);
  }
};

export const getChunkUpdateThrottleMs = (isZooming: boolean, zoomSpeed: number): number => {
  if (zoomSpeed > 1.0) {
    return 500;
  }

  if (isZooming) {
    return 400;
  }

  return 100;
};

export const getMediaDimensions = (media: HTMLImageElement | undefined) => {
  const width = media instanceof HTMLImageElement ? media.naturalWidth || media.width : undefined;
  const height = media instanceof HTMLImageElement ? media.naturalHeight || media.height : undefined;
  return { width, height };
};

export const clearPlaneCache = (): void => {
  planeCache.clear();
};

export const generateChunkPlanes = (cx: number, cy: number, cz: number, params: LayoutParams): PlaneData[] => {
  const planes: PlaneData[] = [];
  const seed = hashString(`${cx},${cy},${cz}`);
  const pad = params.spacing * CHUNK_SIZE;
  const usable = Math.max(1, CHUNK_SIZE - pad * 2);
  const sizeRange = Math.max(0, params.sizeMax - params.sizeMin);

  if (params.mode === "grid") {
    const cols = Math.ceil(Math.sqrt(params.itemsPerChunk));
    const rows = Math.ceil(params.itemsPerChunk / cols);
    const cellW = usable / cols;
    const cellH = usable / rows;

    for (let i = 0; i < params.itemsPerChunk; i++) {
      const s = seed + i * 1000;
      const r = (n: number) => seededRandom(s + n);
      const size = params.sizeMin + r(4) * sizeRange;
      const col = i % cols;
      const row = Math.floor(i / cols);

      planes.push({
        id: `${cx}-${cy}-${cz}-${i}`,
        position: new THREE.Vector3(
          cx * CHUNK_SIZE + pad + (col + 0.5) * cellW,
          cy * CHUNK_SIZE + pad + (row + 0.5) * cellH,
          cz * CHUNK_SIZE + r(2) * CHUNK_SIZE * params.depthSpread,
        ),
        scale: new THREE.Vector3(size, size, 1),
        mediaIndex: Math.floor(r(5) * 1_000_000),
      });
    }
  } else {
    for (let i = 0; i < params.itemsPerChunk; i++) {
      const s = seed + i * 1000;
      const r = (n: number) => seededRandom(s + n);
      const size = params.sizeMin + r(4) * sizeRange;

      planes.push({
        id: `${cx}-${cy}-${cz}-${i}`,
        position: new THREE.Vector3(
          cx * CHUNK_SIZE + pad + r(0) * usable,
          cy * CHUNK_SIZE + pad + r(1) * usable,
          cz * CHUNK_SIZE + r(2) * CHUNK_SIZE * params.depthSpread,
        ),
        scale: new THREE.Vector3(size, size, 1),
        mediaIndex: Math.floor(r(5) * 1_000_000),
      });
    }
  }

  return planes;
};

export const generateChunkPlanesCached = (cx: number, cy: number, cz: number, params: LayoutParams): PlaneData[] => {
  const key = `${cx},${cy},${cz}`;
  const cached = planeCache.get(key);
  if (cached) {
    touchPlaneCache(key);
    return cached;
  }

  const planes = generateChunkPlanes(cx, cy, cz, params);
  planeCache.set(key, planes);
  evictPlaneCache();
  return planes;
};

export const shouldThrottleUpdate = (lastUpdateTime: number, throttleMs: number, currentTime: number): boolean => {
  return currentTime - lastUpdateTime >= throttleMs;
};
