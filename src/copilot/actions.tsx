import { useCopilotAction } from "@copilotkit/react-core";
import * as THREE from "three";
import type { LayoutParams } from "~/src/infinite-canvas/types";
import { useEffects } from "./effects-context";
import type { FrameStyle, OverlayType } from "./effects-store";

/** Validate a color string with Three.js. Returns hex if valid, null if not. */
function validateColor(raw: string): string | null {
  try {
    const c = new THREE.Color(raw);
    // Three.js silently defaults to black for unknown names — detect that
    if (c.r === 0 && c.g === 0 && c.b === 0 && raw !== "black" && raw !== "#000000" && raw !== "#000") {
      return null;
    }
    return `#${c.getHexString()}`;
  } catch {
    return null;
  }
}

/** Normalize a color string: try as-is, then without spaces, then hex fallback. */
function normalizeColor(raw: string, fallback = "#1a1a2e"): string {
  // Try the raw value first (works for hex codes and valid CSS names)
  const direct = validateColor(raw);
  if (direct) return direct;

  // Strip spaces: "dark blue" -> "darkblue"
  const stripped = raw.replace(/\s+/g, "").toLowerCase();
  const strippedResult = validateColor(stripped);
  if (strippedResult) return strippedResult;

  // If it looks like a hex code already (even malformed), return fallback
  return fallback;
}

export function CopilotActions({
  setSceneColors,
  setLayoutParams,
}: {
  setSceneColors: (bg: string, fog: string) => void;
  setLayoutParams: React.Dispatch<React.SetStateAction<LayoutParams>>;
}) {
  const { stateRef, notify } = useEffects();

  useCopilotAction({
    name: "addFrame",
    description: "Add a decorative frame border around all artworks in the gallery",
    parameters: [
      { name: "style", type: "string", description: "Frame style: simple, ornate, or double", required: false },
      { name: "color", type: "string", description: "Frame color as CSS color string (e.g. 'gold', '#ff0000')", required: false },
      { name: "width", type: "number", description: "Frame border width (0.1 to 1.0)", required: false },
    ],
    handler: ({ style, color, width }) => {
      stateRef.current.frames.set("__default__", {
        style: (style as FrameStyle) || "simple",
        color: color || "gold",
        width: Math.max(0.1, Math.min(1.0, width || 0.3)),
      });
      notify();
      return "Frame added to all artworks";
    },
  });

  useCopilotAction({
    name: "addOverlay",
    description: "Add a particle overlay effect around all artworks (sparkles, stars, or dust)",
    parameters: [
      { name: "type", type: "string", description: "Overlay type: sparkles, stars, or dust", required: false },
      { name: "density", type: "number", description: "Particle density (0.1 to 1.0)", required: false },
      { name: "color", type: "string", description: "Particle color as CSS color string", required: false },
    ],
    handler: ({ type, density, color }) => {
      stateRef.current.overlays.set("__default__", {
        type: (type as OverlayType) || "sparkles",
        density: Math.max(0.1, Math.min(1.0, density || 0.5)),
        color: color || "#ffffff",
      });
      notify();
      return "Overlay effect added to all artworks";
    },
  });

  useCopilotAction({
    name: "changeSceneColors",
    description:
      "Change the gallery background and fog colors. ALWAYS use hex color codes, never color names. Examples: navy='#000080', dark blue='#00008b', midnight blue='#191970', black='#000000', dark gray='#333333', deep purple='#1a0033'.",
    parameters: [
      {
        name: "backgroundColor",
        type: "string",
        description: "Background color as hex code. MUST be a hex code like '#1a1a2e'. Never use color names.",
        required: true,
      },
      {
        name: "fogColor",
        type: "string",
        description: "Fog color as hex code like '#1a1a2e'. Defaults to background color.",
        required: false,
      },
    ],
    handler: ({ backgroundColor, fogColor }) => {
      const bg = normalizeColor(backgroundColor, "#1a1a2e");
      const fg = fogColor ? normalizeColor(fogColor, bg) : bg;
      setSceneColors(bg, fg);
      return `Scene colors changed to background: ${bg}, fog: ${fg}`;
    },
  });

  useCopilotAction({
    name: "modifyLayout",
    description: `Change how artworks are arranged in the infinite gallery. Use this when the user asks to reorganize, rearrange, or change the look of the gallery layout.

Semantic guide for translating natural language:
- "museum/gallery style" → grid mode, spacing ~0.2, depthSpread 0, sizeMin/sizeMax similar (e.g. 14-16)
- "dense/packed/crowded" → itemsPerChunk 10-15, spacing 0, sizeMin low
- "sparse/spread out/breathing room" → itemsPerChunk 2-4, spacing 0.3-0.5
- "uniform/consistent size" → sizeMin and sizeMax close together
- "varied/mixed sizes" → sizeMin 6, sizeMax 30+
- "flat/2D" → depthSpread 0
- "3D/depth/immersive" → depthSpread 0.5-1.0
- "bigger/larger artworks" → increase sizeMin and sizeMax
- "smaller/thumbnail" → decrease sizeMin and sizeMax
- "orderly/organized/neat" → grid mode
- "scattered/organic/natural" → random mode

Only set the parameters that need to change based on what the user asked. Leave others unchanged.`,
    parameters: [
      {
        name: "itemsPerChunk",
        type: "number",
        description: "How many artworks appear in each region of space (1=very sparse, 5=normal, 15=very dense)",
        required: false,
      },
      {
        name: "sizeMin",
        type: "number",
        description: "Smallest artwork display size in units (4=tiny thumbnails, 12=default, 30=very large)",
        required: false,
      },
      {
        name: "sizeMax",
        type: "number",
        description: "Largest artwork display size in units (4=tiny, 20=default, 50=huge). Must be >= sizeMin",
        required: false,
      },
      {
        name: "spacing",
        type: "number",
        description:
          "Gap between artworks as a fraction (0=no gap/overlapping, 0.15=comfortable, 0.3=spacious, 0.5=maximum breathing room)",
        required: false,
      },
      {
        name: "mode",
        type: "string",
        description: "Layout mode: 'grid' for orderly rows/columns (museum-like), 'random' for organic scattered placement",
        required: false,
      },
      {
        name: "depthSpread",
        type: "number",
        description:
          "How much artworks vary in Z-depth (0=all on same plane/flat, 0.5=moderate 3D depth, 1.0=full 3D spread)",
        required: false,
      },
    ],
    handler: ({ itemsPerChunk, sizeMin, sizeMax, spacing, mode, depthSpread }) => {
      setLayoutParams((prev) => {
        const next = {
          itemsPerChunk: itemsPerChunk ?? prev.itemsPerChunk,
          sizeMin: sizeMin ?? prev.sizeMin,
          sizeMax: sizeMax ?? prev.sizeMax,
          spacing: spacing ?? prev.spacing,
          mode: (mode as "random" | "grid") ?? prev.mode,
          depthSpread: depthSpread ?? prev.depthSpread,
        };
        // Enforce constraints
        next.itemsPerChunk = Math.max(1, Math.min(15, next.itemsPerChunk));
        next.sizeMin = Math.max(4, Math.min(30, next.sizeMin));
        next.sizeMax = Math.max(next.sizeMin, Math.min(50, next.sizeMax));
        next.spacing = Math.max(0, Math.min(0.5, next.spacing));
        next.depthSpread = Math.max(0, Math.min(1, next.depthSpread));
        return next;
      });
      const changes: string[] = [];
      if (itemsPerChunk !== undefined) changes.push(`density: ${itemsPerChunk} items/chunk`);
      if (mode !== undefined) changes.push(`mode: ${mode}`);
      if (sizeMin !== undefined || sizeMax !== undefined) changes.push(`size range: ${sizeMin ?? "unchanged"}-${sizeMax ?? "unchanged"}`);
      if (spacing !== undefined) changes.push(`spacing: ${(spacing * 100).toFixed(0)}%`);
      if (depthSpread !== undefined) changes.push(`depth: ${(depthSpread * 100).toFixed(0)}%`);
      return `Layout updated: ${changes.join(", ")}`;
    },
  });

  useCopilotAction({
    name: "clearAllEffects",
    description: "Remove all visual effects (frames, overlays) and reset scene colors to white",
    parameters: [],
    handler: () => {
      stateRef.current.frames.clear();
      stateRef.current.overlays.clear();
      notify();
      setSceneColors("#ffffff", "#ffffff");
      return "All effects cleared and colors reset";
    },
  });

  return null;
}
