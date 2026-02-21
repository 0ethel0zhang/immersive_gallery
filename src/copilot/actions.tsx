import { useCopilotAction } from "@copilotkit/react-core";
import type { LayoutParams } from "~/src/infinite-canvas/types";
import { useEffects } from "./effects-context";
import type { FrameStyle, OverlayType } from "./effects-store";

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
    description: "Change the gallery background and fog colors",
    parameters: [
      { name: "backgroundColor", type: "string", description: "Background color as CSS color (e.g. 'dark blue', '#1a1a2e')", required: true },
      { name: "fogColor", type: "string", description: "Fog color as CSS color. Defaults to a lighter version of background", required: false },
    ],
    handler: ({ backgroundColor, fogColor }) => {
      setSceneColors(backgroundColor, fogColor || backgroundColor);
      return `Scene colors changed to background: ${backgroundColor}, fog: ${fogColor || backgroundColor}`;
    },
  });

  useCopilotAction({
    name: "modifyLayout",
    description: "Modify the artwork layout parameters (items per chunk, sizes, spacing, mode, depth)",
    parameters: [
      { name: "itemsPerChunk", type: "number", description: "Number of artworks per chunk (1-15)", required: false },
      { name: "sizeMin", type: "number", description: "Minimum artwork size (4-30)", required: false },
      { name: "sizeMax", type: "number", description: "Maximum artwork size (4-50)", required: false },
      { name: "spacing", type: "number", description: "Spacing between items (0-0.5)", required: false },
      { name: "mode", type: "string", description: "Layout mode: 'random' or 'grid'", required: false },
      { name: "depthSpread", type: "number", description: "Depth spread (0-1)", required: false },
    ],
    handler: ({ itemsPerChunk, sizeMin, sizeMax, spacing, mode, depthSpread }) => {
      setLayoutParams((prev) => ({
        itemsPerChunk: itemsPerChunk ?? prev.itemsPerChunk,
        sizeMin: sizeMin ?? prev.sizeMin,
        sizeMax: sizeMax ?? prev.sizeMax,
        spacing: spacing ?? prev.spacing,
        mode: (mode as "random" | "grid") ?? prev.mode,
        depthSpread: depthSpread ?? prev.depthSpread,
      }));
      return "Layout parameters updated";
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
