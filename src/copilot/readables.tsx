import { useCopilotReadable } from "@copilotkit/react-core";
import * as React from "react";
import type { LayoutParams, MediaItem } from "~/src/infinite-canvas/types";
import { useEffects } from "./effects-context";

export function CopilotReadables({
  media,
  layoutParams,
}: {
  media: MediaItem[];
  layoutParams: LayoutParams;
}) {
  const { stateRef, revision } = useEffects();

  const artworkSummary = React.useMemo(
    () =>
      media.slice(0, 20).map((m) => ({
        title: m.title ?? "Untitled",
        artist: m.artist ?? "Unknown",
        year: m.year ?? "Unknown",
        dimensions: `${m.width}x${m.height}`,
      })),
    [media],
  );

  const effectsSummary = React.useMemo(() => {
    const s = stateRef.current;
    return {
      framesCount: s.frames.size,
      overlaysCount: s.overlays.size,
      defaultFrame: s.frames.get("__default__") ?? null,
      defaultOverlay: s.overlays.get("__default__") ?? null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);

  useCopilotReadable({
    description: `Gallery artwork collection (${media.length} total, showing first 20)`,
    value: artworkSummary,
  });

  useCopilotReadable({
    description: "Current layout parameters controlling how artworks are arranged",
    value: layoutParams,
  });

  useCopilotReadable({
    description: "Currently applied visual effects (frames, overlays)",
    value: effectsSummary,
  });

  return null;
}
