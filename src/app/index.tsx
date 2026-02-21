import { CopilotKit } from "@copilotkit/react-core";
import * as React from "react";
import manifest from "~/src/artworks/manifest.json";
import { ChatPanel } from "~/src/chat";
import { CopilotActions } from "~/src/copilot/actions";
import { EffectsProvider } from "~/src/copilot/effects-context";
import { CopilotReadables } from "~/src/copilot/readables";
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
  const [sceneColors, setSceneColorsState] = React.useState({ backgroundColor: "#ffffff", fogColor: "#ffffff" });

  const setSceneColors = React.useCallback((bg: string, fog: string) => {
    setSceneColorsState({ backgroundColor: bg, fogColor: fog });
  }, []);

  const addUploadedMedia = React.useCallback((items: MediaItem[]) => {
    setMedia((prev) => [...prev, ...items]);
  }, []);

  if (!media.length) {
    return <PageLoader progress={0} />;
  }

  return (
    <CopilotKit runtimeUrl="/api/copilotkit">
      <EffectsProvider>
        <Frame onUpload={addUploadedMedia} />
        <PageLoader progress={textureProgress} />
        <InfiniteCanvas
          media={media}
          onTextureProgress={setTextureProgress}
          focusEffectType="fire"
          layoutParams={layoutParams}
          backgroundColor={sceneColors.backgroundColor}
          fogColor={sceneColors.fogColor}
        />
        <LayoutPane params={layoutParams} onChange={setLayoutParams} />
        <CopilotActions setSceneColors={setSceneColors} setLayoutParams={setLayoutParams} />
        <CopilotReadables media={media} layoutParams={layoutParams} />
        <ChatPanel />
        <MusicPlayer />
      </EffectsProvider>
    </CopilotKit>
  );
}
