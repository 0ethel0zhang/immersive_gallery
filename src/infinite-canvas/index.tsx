"use client";

import * as React from "react";
import type { InfiniteCanvasProps } from "./types";

const LazyInfiniteCanvasScene = React.lazy(() => import("./scene").then((mod) => ({ default: mod.InfiniteCanvasScene })));

export function InfiniteCanvas({ media, onReady, onTextureProgress }: InfiniteCanvasProps) {
  return (
    <React.Suspense fallback={null}>
      <LazyInfiniteCanvasScene media={media} onReady={onReady} onTextureProgress={onTextureProgress} />
    </React.Suspense>
  );
}
