import * as React from "react";
import styles from "./style.module.css";

const SOUNDCLOUD_URL = "https://soundcloud.com/is-ghouneim/interstellar-main-theme";
const WIDGET_SRC = `https://w.soundcloud.com/player/?url=${encodeURIComponent(SOUNDCLOUD_URL)}&auto_play=true&show_artwork=false&visual=false`;

declare global {
  interface Window {
    SC: {
      Widget: {
        (el: HTMLIFrameElement): SCWidget;
        Events: { READY: string; FINISH: string };
      };
    };
  }
}

interface SCWidget {
  bind(event: string, callback: () => void): void;
  play(): void;
  setVolume(volume: number): void;
}

export function MusicPlayer() {
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const widgetRef = React.useRef<SCWidget | null>(null);
  const [muted, setMuted] = React.useState(true);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://w.soundcloud.com/player/api.js";
    script.onload = () => {
      if (!iframeRef.current) return;
      const widget = window.SC.Widget(iframeRef.current);
      widgetRef.current = widget;
      widget.bind(window.SC.Widget.Events.READY, () => {
        widget.setVolume(0);
        widget.play();
        setReady(true);
      });
      widget.bind(window.SC.Widget.Events.FINISH, () => {
        widget.play();
      });
    };
    document.body.appendChild(script);
    return () => {
      script.remove();
    };
  }, []);

  const toggle = React.useCallback(() => {
    if (!widgetRef.current) return;
    const next = !muted;
    widgetRef.current.setVolume(next ? 0 : 80);
    setMuted(next);
  }, [muted]);

  return (
    <>
      <iframe ref={iframeRef} src={WIDGET_SRC} allow="autoplay; encrypted-media" style={{ display: "none" }} />
      {ready && (
        <button className={styles.toggle} onClick={toggle} type="button" aria-label={muted ? "Unmute music" : "Mute music"}>
          {muted ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
          )}
        </button>
      )}
    </>
  );
}
