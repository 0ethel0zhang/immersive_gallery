import * as React from "react";
import type { LayoutMode, LayoutParams } from "~/src/infinite-canvas/types";
import styles from "./style.module.css";

type LayoutPaneProps = {
  params: LayoutParams;
  onChange: (params: LayoutParams) => void;
};

export function LayoutPane({ params, onChange }: LayoutPaneProps) {
  const [open, setOpen] = React.useState(false);

  const update = <K extends keyof LayoutParams>(key: K, value: LayoutParams[K]) => {
    onChange({ ...params, [key]: value });
  };

  return (
    <div className={styles.pane}>
      <button className={styles.toggle} onClick={() => setOpen((v) => !v)} type="button" aria-label="Toggle layout controls">
        {open ? "\u2715" : "\u2699"}
      </button>

      {open && (
        <div className={styles.controls}>
          <label className={styles.label}>
            Mode
            <select className={styles.select} value={params.mode} onChange={(e) => update("mode", e.target.value as LayoutMode)}>
              <option value="random">Random</option>
              <option value="grid">Grid</option>
            </select>
          </label>

          <label className={styles.label}>
            Items per chunk ({params.itemsPerChunk})
            <input
              className={styles.slider}
              type="range"
              min={1}
              max={15}
              step={1}
              value={params.itemsPerChunk}
              onChange={(e) => update("itemsPerChunk", Number(e.target.value))}
            />
          </label>

          <label className={styles.label}>
            Size min ({params.sizeMin})
            <input
              className={styles.slider}
              type="range"
              min={4}
              max={30}
              step={1}
              value={params.sizeMin}
              onChange={(e) => update("sizeMin", Math.min(Number(e.target.value), params.sizeMax))}
            />
          </label>

          <label className={styles.label}>
            Size max ({params.sizeMax})
            <input
              className={styles.slider}
              type="range"
              min={4}
              max={50}
              step={1}
              value={params.sizeMax}
              onChange={(e) => update("sizeMax", Math.max(Number(e.target.value), params.sizeMin))}
            />
          </label>

          <label className={styles.label}>
            Spacing ({(params.spacing * 100).toFixed(0)}%)
            <input
              className={styles.slider}
              type="range"
              min={0}
              max={0.5}
              step={0.01}
              value={params.spacing}
              onChange={(e) => update("spacing", Number(e.target.value))}
            />
          </label>

          <label className={styles.label}>
            Depth spread ({(params.depthSpread * 100).toFixed(0)}%)
            <input
              className={styles.slider}
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={params.depthSpread}
              onChange={(e) => update("depthSpread", Number(e.target.value))}
            />
          </label>
        </div>
      )}
    </div>
  );
}
