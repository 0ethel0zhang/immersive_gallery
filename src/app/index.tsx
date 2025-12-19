import * as React from "react";
import { InfiniteCanvas } from "~/src/infinite-canvas";
import type { MediaItem } from "~/src/infinite-canvas/types";
import { PageLoader } from "~/src/loader";

export function App() {
  const [media, setMedia] = React.useState<MediaItem[]>([]);
  const [canvasReady, setCanvasReady] = React.useState(false);
  const [textureProgress, setTextureProgress] = React.useState(0);

  React.useEffect(() => {
    fetch("/artworks/manifest.json")
      .then((res) => res.json())
      .then(setMedia)
      .catch(console.error);
  }, []);

  const progress = canvasReady ? 100 : textureProgress;

  if (!media.length) return <PageLoader progress={0} />;

  return (
    <>
      <PageLoader progress={progress} />
      <InfiniteCanvas media={media} onReady={() => setCanvasReady(true)} onTextureProgress={setTextureProgress} />
    </>
  );
}
