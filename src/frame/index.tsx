import * as React from "react";
import type { MediaItem } from "~/src/infinite-canvas/types";
import styles from "./style.module.css";

function loadImageDimensions(
  url: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = url;
  });
}

export function Frame({ onUpload }: { onUpload?: (items: MediaItem[]) => void }) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleChange = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files?.length || !onUpload) return;
      const items: MediaItem[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith("image/")) continue;
        const url = URL.createObjectURL(file);
        try {
          const { width, height } = await loadImageDimensions(url);
          items.push({ url, width, height });
        } catch {
          URL.revokeObjectURL(url);
        }
      }
      if (items.length) onUpload(items);
      e.target.value = "";
    },
    [onUpload]
  );

  return (
    <header className={`frame ${styles.frame}`}>
      <h1 className={styles.frame__title}>Immersive Gallery</h1>
      <a className={styles.frame__back} href="https://nyc.aitinkerers.org/">
        AI Tinkerers NYC
      </a>
      <a className={styles.frame__archive} href="">
        Feb 21, 2026
      </a>
      <a className={styles.frame__github} href="https://nyc.aitinkerers.org/p/interfaces-hackathon-with-claude">
        Claude Interface Hackathon
      </a>

      {onUpload && (
        <div className={styles.frame__uploadWrap}>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className={styles.frame__fileInput}
            aria-label="Upload images"
            onChange={handleChange}
          />
          <button
            type="button"
            className={styles.frame__upload}
            onClick={() => inputRef.current?.click()}
          >
            Upload
          </button>
        </div>
      )}

      <nav className={styles.frame__tags}>
        <span>By</span>
        <span>Ethel Zhang</span>
        <span>Enrique Munguia</span>
        <span>Jean-Ezra Yeung</span>
        <span>Jing Huang</span>
      </nav>
    </header>
  );
}
