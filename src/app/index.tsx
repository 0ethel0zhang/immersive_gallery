import * as React from "react";
import manifest from "~/src/artworks/manifest.json";
import { Frame } from "~/src/frame";
import { InfiniteCanvas } from "~/src/infinite-canvas";
import { DEFAULT_LAYOUT_PARAMS } from "~/src/infinite-canvas/types";
import type { LayoutParams, MediaItem } from "~/src/infinite-canvas/types";
import { LayoutPane } from "~/src/layout-pane";
import { MusicPlayer } from "~/src/music-player";
import { PageLoader } from "~/src/loader";

export function App() {
  const [media, setMedia] = React.useState<MediaItem[]>(manifest);
  const [textureProgress, setTextureProgress] = React.useState(0);
  const [layoutParams, setLayoutParams] = React.useState<LayoutParams>(DEFAULT_LAYOUT_PARAMS);

  const addUploadedMedia = React.useCallback((items: MediaItem[]) => {
    setMedia((prev) => [...prev, ...items]);
  }, []);

  if (!media.length) {
    return <PageLoader progress={0} />;
  }

  return (
    <>
      <Frame onUpload={addUploadedMedia} />
      <PageLoader progress={textureProgress} />
      <InfiniteCanvas
        media={media}
        onTextureProgress={setTextureProgress}
        focusEffectType="fire"
        layoutParams={layoutParams}
      />
      <LayoutPane params={layoutParams} onChange={setLayoutParams} />
      <MusicPlayer />
    </>
  );
}
