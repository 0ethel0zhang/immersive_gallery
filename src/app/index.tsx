import * as React from "react";
import { fetchArticArtworks } from "~/src/api";
import { InfiniteCanvas } from "~/src/infinite-canvas";
import type { MediaItem } from "~/src/infinite-canvas/types";
import { PageLoader } from "~/src/loader";
import { run } from "~/src/utils";
import styles from "./style.module.css";

const EXPECTED_ARTWORKS = 200; // Minimum expected artworks

export function App() {
  const [media, setMedia] = React.useState<MediaItem[]>([]);
  const [dataLoading, setDataLoading] = React.useState(true);
  const [canvasReady, setCanvasReady] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [textureProgress, setTextureProgress] = React.useState(0);
  const maxProgressRef = React.useRef(0);

  const totalProgress = run(() => {
    let currentProgress = 0;

    if (dataLoading) {
      const fetchedCount = Math.max(media.length, 1);
      currentProgress = Math.min((fetchedCount / EXPECTED_ARTWORKS) * 30, 30);
    } else if (canvasReady) {
      currentProgress = 100;
    } else {
      currentProgress = 30 + textureProgress * 0.7;
    }

    if (currentProgress > maxProgressRef.current) {
      maxProgressRef.current = currentProgress;
    }

    return maxProgressRef.current;
  });

  React.useEffect(() => {
    let mounted = true;
    const fetchId = Math.random();

    const fetchAll = async () => {
      try {
        const batchSize = 50;
        const maxItems = 250;

        let page = 1;
        let allArtworks: MediaItem[] = [];

        while (mounted && allArtworks.length < maxItems) {
          console.log(`[${fetchId}] Fetching page ${page} (batchSize=${batchSize})...`);

          const batch = await fetchArticArtworks(page, batchSize);

          if (!mounted) break;

          if (!batch.length) break;

          allArtworks.push(...batch);

          if (allArtworks.length > maxItems) {
            allArtworks = allArtworks.slice(0, maxItems);
          }

          page += 1;
        }

        if (!mounted) return;

        if (allArtworks.length === 0) {
          setError("No artworks found from API.");
        } else {
          setMedia(allArtworks);
        }
        setDataLoading(false);
      } catch (err) {
        if (!mounted) return;
        console.error("Failed to fetch artworks:", err);
        setError(`Failed to load from API: ${err instanceof Error ? err.message : String(err)}`);
        setDataLoading(false);
      }
    };

    fetchAll();

    return () => {
      mounted = false;
    };
  }, []);

  const handleCanvasReady = () => {
    setCanvasReady(true);
  };

  const handleTextureProgress = (progress: number) => {
    setTextureProgress(progress);
  };

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <div className={styles.errorMessage}>{error}</div>
        <button type="button" onClick={() => window.location.reload()} className={styles.retryButton}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <>
      <PageLoader progress={totalProgress} />
      {media.length > 0 && (
        <InfiniteCanvas
          media={media}
          onReady={handleCanvasReady}
          onTextureProgress={handleTextureProgress}
          showControls
          showFps
        />
      )}
    </>
  );
}
