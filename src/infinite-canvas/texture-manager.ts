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

  colorCtx.drawImage(img, 0, 0, 16, 16);
  const data = colorCtx.getImageData(0, 0, 16, 16).data;

  let r = 0,
    g = 0,
    b = 0;
  const pixels = 16 * 16;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }

  const color = new THREE.Color(r / pixels / 255, g / pixels / 255, b / pixels / 255);
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
