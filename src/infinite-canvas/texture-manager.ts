import * as THREE from "three";
import type { MediaItem } from "./types";

type CacheEntry = {
  key: string;
  texture: THREE.Texture;
  bytes: number;
};

const MAX_TEXTURES = 280;

const lru = new Map<string, CacheEntry>();

const estimateBytes = (tex: THREE.Texture): number => {
  const img = tex.image as HTMLImageElement | undefined;
  const w = img instanceof HTMLImageElement ? img.naturalWidth || img.width : 0;
  const h = img instanceof HTMLImageElement ? img.naturalHeight || img.height : 0;
  return Math.max(1, w) * Math.max(1, h) * 4;
};

const touch = (key: string) => {
  const v = lru.get(key);
  if (!v) return;
  lru.delete(key);
  lru.set(key, v);
};

const evictIfNeeded = () => {
  while (lru.size > MAX_TEXTURES) {
    const first = lru.values().next().value as CacheEntry | undefined;
    if (!first) break;

    lru.delete(first.key);
    first.texture.dispose();
  }
};

export const getTexture = (item: MediaItem): THREE.Texture | null => {
  const key = item.url;
  const existing = lru.get(key);
  if (existing) {
    touch(key);
    return existing.texture;
  }

  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin("anonymous");

  const texture = loader.load(key);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;

  lru.set(key, { key, texture, bytes: estimateBytes(texture) });
  evictIfNeeded();
  return texture;
};
