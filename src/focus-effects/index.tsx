import * as React from "react";
import styles from "./style.module.css";

export type FocusColor = { r: number; g: number; b: number };

export type FocusEffectsProps = {
  color: FocusColor | null;
  coverage?: number;
  effectType?: "fire" | "cloud" | "flowers";
  children?: React.ReactNode;
};

const COVERAGE_THRESHOLD = 0.3;

function toRgb(c: FocusColor): string {
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);
  return `${r}, ${g}, ${b}`;
}

function darker(c: FocusColor, factor: number): string {
  return `${Math.round(c.r * 255 * factor)}, ${Math.round(c.g * 255 * factor)}, ${Math.round(c.b * 255 * factor)}`;
}

export function FocusEffects({
  color,
  coverage = 0,
  effectType = "fire",
  children,
}: FocusEffectsProps) {
  const visible = color !== null && coverage >= COVERAGE_THRESHOLD;

  if (children) {
    return (
      <div
        className={styles.overlay}
        style={{
          opacity: visible ? 0.5 : 0,
          pointerEvents: "none",
          position: "fixed",
          inset: 0,
          zIndex: 100,
        }}
      >
        {children}
      </div>
    );
  }

  if (!visible || !color) {
    return null;
  }

  const rgb = toRgb(color);
  const rgbDark = darker(color, 0.5);
  const rgbSoft = darker(color, 0.85);

  const effectClass =
    effectType === "fire"
      ? styles.fire
      : effectType === "cloud"
        ? styles.cloud
        : styles.flowers;

  return (
    <div
      className={`${styles.overlay} ${styles.overlayVisible} ${effectClass}`}
      style={
        {
          "--effect-color": `rgb(${rgb})`,
          "--effect-color-dark": `rgb(${rgbDark})`,
          "--effect-color-soft": `rgb(${rgbSoft})`,
        } as React.CSSProperties
      }
    />
  );
}
