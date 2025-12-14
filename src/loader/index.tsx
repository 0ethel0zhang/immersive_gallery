import * as React from "react";
import styles from "./style.module.css";

export function PageLoader({ progress }: { progress: number }) {
  const [show, setShow] = React.useState(true);
  const [minTimeElapsed, setMinTimeElapsed] = React.useState(false);
  const [visualProgress, setVisualProgress] = React.useState(0);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setMinTimeElapsed(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  React.useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();

    const animate = (currentTime: number) => {
      const deltaTime = currentTime - lastTime;
      lastTime = currentTime;

      setVisualProgress((prev) => {
        if (prev >= progress) return progress;

        const diff = progress - prev;
        const lerpFactor = Math.min(deltaTime / 16.67, 1) * 0.15;
        const step = diff * lerpFactor;
        const minStep = diff > 0.1 ? 0.1 : diff;
        const finalStep = Math.max(step, minStep);

        return Math.min(prev + finalStep, progress);
      });

      animationFrameId = requestAnimationFrame(animate);
    };

    lastTime = performance.now();
    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, [progress]);

  React.useEffect(() => {
    if (minTimeElapsed && progress === 100 && visualProgress >= 99.9) {
      const t = setTimeout(() => setShow(false), 200);
      return () => clearTimeout(t);
    }
  }, [minTimeElapsed, progress, visualProgress]);

  if (!show) {
    return null;
  }

  const isHidden = minTimeElapsed && progress === 100 && visualProgress >= 99.9;

  return (
    <div className={`${styles.overlay} ${isHidden ? styles.hidden : styles.visible}`}>
      <div className={styles.progressBarContainer}>
        <div
          className={styles.progressBarFill}
          style={{
            transform: `scaleX(${visualProgress / 100})`,
          }}
        />
      </div>
    </div>
  );
}
