import * as THREE from "three";
import type { MediaItem } from "./types";

const textureCache = new Map<string, THREE.Texture>();
const dominantColorCache = new Map<string, THREE.Color>();
const loadCallbacks = new Map<string, Set<(tex: THREE.Texture) => void>>();
const loader = new THREE.TextureLoader();

const colorCanvas = document.createElement("canvas");
colorCanvas.width = 16;
colorCanvas.height = 16;
const colorCtx = colorCanvas.getContext("2d", { willReadFrequently: true })!;

export const getDominantColor = (item: MediaItem, texture: THREE.Texture): THREE.Color | null => {
  const key = item.url;
  const cached = dominantColorCache.get(key);
  if (cached) return cached;

  const img = texture.image as HTMLImageElement | undefined;
  if (!(img instanceof HTMLImageElement) || !img.complete || img.naturalWidth === 0) return null;

  const sz = 32;
  colorCanvas.width = sz;
  colorCanvas.height = sz;
  colorCtx.drawImage(img, 0, 0, sz, sz);
  const data = colorCtx.getImageData(0, 0, sz, sz).data;

  // Bucket hues of saturated pixels to find the dominant chromatic color
  const HUE_BUCKETS = 12;
  const bucketCount = new Float32Array(HUE_BUCKETS);
  const bucketR = new Float32Array(HUE_BUCKETS);
  const bucketG = new Float32Array(HUE_BUCKETS);
  const bucketB = new Float32Array(HUE_BUCKETS);
  let totalSaturated = 0;

  for (let i = 0; i < data.length; i += 4) {
    const pr = data[i] / 255;
    const pg = data[i + 1] / 255;
    const pb = data[i + 2] / 255;
    const max = Math.max(pr, pg, pb);
    const min = Math.min(pr, pg, pb);
    const delta = max - min;
    const lightness = (max + min) / 2;
    const sat = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

    // Only count pixels with meaningful saturation and mid-range lightness
    if (sat < 0.2 || lightness > 0.9 || lightness < 0.1) continue;

    let hue = 0;
    if (delta > 0) {
      if (max === pr) hue = ((pg - pb) / delta + 6) % 6;
      else if (max === pg) hue = (pb - pr) / delta + 2;
      else hue = (pr - pg) / delta + 4;
    }
    const bucket = Math.floor((hue / 6) * HUE_BUCKETS) % HUE_BUCKETS;
    // Weight by saturation so vivid colors win over dull ones
    const weight = sat;
    bucketCount[bucket] += weight;
    bucketR[bucket] += pr * weight;
    bucketG[bucket] += pg * weight;
    bucketB[bucket] += pb * weight;
    totalSaturated += weight;
  }

  let color: THREE.Color;
  if (totalSaturated < 5) {
    // Not enough chromatic pixels — fall back to simple average
    let r = 0,
      g = 0,
      b = 0;
    const pixels = sz * sz;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    color = new THREE.Color(r / pixels / 255, g / pixels / 255, b / pixels / 255);
  } else {
    // Find the hue bucket with the most weight
    let bestBucket = 0;
    for (let i = 1; i < HUE_BUCKETS; i++) {
      if (bucketCount[i] > bucketCount[bestBucket]) bestBucket = i;
    }
    const w = bucketCount[bestBucket];
    color = new THREE.Color(bucketR[bestBucket] / w, bucketG[bestBucket] / w, bucketB[bestBucket] / w);
  }

  dominantColorCache.set(key, color);
  return color;
};

const isTextureLoaded = (tex: THREE.Texture): boolean => {
  const img = tex.image as HTMLImageElement | undefined;
  return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0;
};

export const getTexture = (item: MediaItem, onLoad?: (texture: THREE.Texture) => void): THREE.Texture => {
  const key = item.url;
  const existing = textureCache.get(key);

  if (existing) {
    if (onLoad) {
      if (isTextureLoaded(existing)) {
        onLoad(existing);
      } else {
        loadCallbacks.get(key)?.add(onLoad);
      }
    }
    return existing;
  }

  const callbacks = new Set<(tex: THREE.Texture) => void>();
  if (onLoad) callbacks.add(onLoad);
  loadCallbacks.set(key, callbacks);

  const texture = loader.load(
    key,
    (tex) => {
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = true;
      tex.anisotropy = 4;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;

      loadCallbacks.get(key)?.forEach((cb) => {
        try {
          cb(tex);
        } catch (err) {
          console.error(`Callback failed: ${JSON.stringify(err)}`);
        }
      });
      loadCallbacks.delete(key);
    },
    undefined,
    (err) => console.error("Texture load failed:", key, err)
  );

  textureCache.set(key, texture);
  return texture;
};
