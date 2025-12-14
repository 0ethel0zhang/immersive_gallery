import { useProgress } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as React from "react";
import * as THREE from "three";
import { useIsTouchDevice } from "~/src/use-is-touch-device";
import { clamp, lerp, run } from "~/src/utils";
import {
  CHUNK_FADE_MARGIN,
  CHUNK_OFFSETS,
  CHUNK_SIZE,
  DEPTH_FADE_END,
  DEPTH_FADE_EXTRA,
  DEPTH_FADE_START,
  DPR_MAX_DESKTOP,
  DPR_MAX_TOUCH,
  DRIFT_LERP_NORMAL,
  DRIFT_LERP_ZOOMING,
  FPS_UPDATE_INTERVAL,
  FULL_OPACITY_THRESHOLD,
  IDLE_CALLBACK_TIMEOUT,
  INITIAL_CAMERA_Z,
  INVIS_THRESHOLD,
  KEYBOARD_SPEED,
  MAX_DRIFT,
  MAX_VELOCITY,
  MOUSE_DRAG_SENSITIVITY,
  READY_DELAY,
  RENDER_DISTANCE,
  SCROLL_ACCUM_DECAY,
  SPACE_SPEED_MULTIPLIER,
  TOUCH_DRAG_SENSITIVITY,
  TOUCH_PINCH_SENSITIVITY,
  VELOCITY_DECAY,
  VELOCITY_LERP,
  VISIBILITY_LERP,
  WHEEL_SCROLL_SENSITIVITY,
  ZOOM_FACTOR_BASE,
  ZOOM_FACTOR_MAX,
  ZOOM_FACTOR_MIN,
  ZOOMING_THRESHOLD,
} from "./constants";
import styles from "./style.module.css";
import { getTexture } from "./texture-manager";
import type { ChunkData, InfiniteCanvasProps, MediaItem, PlaneData } from "./types";
import { generateChunkPlanesCached, getChunkUpdateThrottleMs, getMediaDimensions, shouldThrottleUpdate } from "./utils";

const PLANE_GEOMETRY = new THREE.PlaneGeometry(1, 1);

const getTouchDistance = (touches: Touch[]) => {
  if (touches.length < 2) return 0;
  const [t1, t2] = touches;
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
};

type CameraGridState = {
  cx: number;
  cy: number;
  cz: number;
  camZ: number;
};

function MediaPlane({
  position,
  scale,
  media,
  chunkCx,
  chunkCy,
  chunkCz,
  cameraGridRef,
}: {
  position: THREE.Vector3;
  scale: THREE.Vector3;
  media: MediaItem;
  chunkCx: number;
  chunkCy: number;
  chunkCz: number;
  cameraGridRef: React.MutableRefObject<CameraGridState>;
}) {
  const meshRef = React.useRef<THREE.Mesh>(null);
  const materialRef = React.useRef<THREE.MeshBasicMaterial>(null);

  const [texture, setTexture] = React.useState<THREE.Texture | null>(null);
  const [isReady, setIsReady] = React.useState(false);

  const readyRef = React.useRef(false);
  const opacityRef = React.useRef(0);
  const frameSkipRef = React.useRef(0);

  useFrame(() => {
    const material = materialRef.current;
    const mesh = meshRef.current;
    if (!material || !mesh) return;

    frameSkipRef.current = (frameSkipRef.current + 1) & 1;
    if (opacityRef.current < INVIS_THRESHOLD && !mesh.visible && frameSkipRef.current === 0) return;

    const cam = cameraGridRef.current;
    const dist = Math.max(Math.abs(chunkCx - cam.cx), Math.abs(chunkCy - cam.cy), Math.abs(chunkCz - cam.cz));

    const gridTarget =
      dist <= RENDER_DISTANCE ? 1 : Math.max(0, 1 - (dist - RENDER_DISTANCE) / Math.max(CHUNK_FADE_MARGIN, 0.0001));

    const absDepth = Math.abs(position.z - cam.camZ);
    if (absDepth > DEPTH_FADE_END + DEPTH_FADE_EXTRA) {
      opacityRef.current = 0;
      material.opacity = 0;
      material.depthWrite = false;
      mesh.visible = false;
      return;
    }

    const depthLinear =
      absDepth <= DEPTH_FADE_START
        ? 1
        : Math.max(0, 1 - (absDepth - DEPTH_FADE_START) / Math.max(DEPTH_FADE_END - DEPTH_FADE_START, 0.0001));
    const depthTarget = depthLinear * depthLinear;

    const targetVisibility = Math.min(gridTarget, depthTarget);

    if (targetVisibility < INVIS_THRESHOLD && opacityRef.current < INVIS_THRESHOLD) {
      opacityRef.current = 0;
      material.opacity = 0;
      material.depthWrite = false;
      mesh.visible = false;
      return;
    }

    opacityRef.current = lerp(opacityRef.current, targetVisibility, VISIBILITY_LERP);

    if (opacityRef.current > FULL_OPACITY_THRESHOLD) {
      opacityRef.current = 1;
      material.opacity = 1;
      material.depthWrite = true;
    } else {
      material.opacity = opacityRef.current;
      material.depthWrite = false;
    }

    mesh.visible = opacityRef.current > INVIS_THRESHOLD;
  });

  const displayScale = run(() => {
    if (media.width && media.height) {
      const aspect = media.width / media.height || 1;
      return new THREE.Vector3(scale.y * aspect, scale.y, 1);
    }

    if (!texture) return scale;

    const mediaEl = texture.image as HTMLImageElement | undefined;
    const { width: naturalWidth, height: naturalHeight } = getMediaDimensions(mediaEl);

    if (!naturalWidth || !naturalHeight) return scale;

    const aspect = naturalWidth / naturalHeight || 1;
    return new THREE.Vector3(scale.y * aspect, scale.y, 1);
  });

  React.useEffect(() => {
    setIsReady(false);
    readyRef.current = false;
    opacityRef.current = 0;

    const material = materialRef.current;
    if (material) {
      material.opacity = 0;
      material.depthWrite = false;
      material.map = null;
    }

    const tex = getTexture(media);
    setTexture(tex);

    const mediaEl = tex?.image as HTMLImageElement | undefined;

    const markReady = () => {
      readyRef.current = true;
      setIsReady(true);
    };

    if (mediaEl instanceof HTMLImageElement) {
      if (mediaEl.complete && mediaEl.naturalWidth > 0 && mediaEl.naturalHeight > 0) {
        markReady();
      } else {
        const handleLoad = () => markReady();
        mediaEl.addEventListener("load", handleLoad, { once: true });
        return () => mediaEl.removeEventListener("load", handleLoad);
      }
    } else {
      markReady();
    }
  }, [media]);

  React.useEffect(() => {
    const material = materialRef.current;
    const mesh = meshRef.current;
    if (!material || !mesh || !texture || !isReady || !readyRef.current) return;

    material.map = texture;
    material.opacity = opacityRef.current;
    material.depthWrite = opacityRef.current >= 1;
    mesh.scale.copy(displayScale);
  }, [displayScale, texture, isReady]);

  if (!texture || !isReady) return null;

  return (
    <mesh ref={meshRef} position={position} scale={displayScale} visible={false} geometry={PLANE_GEOMETRY}>
      <meshBasicMaterial ref={materialRef} transparent opacity={0} side={THREE.DoubleSide} />
    </mesh>
  );
}

function Chunk({
  cx,
  cy,
  cz,
  media,
  cameraGridRef,
}: {
  cx: number;
  cy: number;
  cz: number;
  media: MediaItem[];
  cameraGridRef: React.MutableRefObject<CameraGridState>;
}) {
  const [planes, setPlanes] = React.useState<PlaneData[] | null>(null);

  React.useEffect(() => {
    let canceled = false;

    const run = () => {
      if (canceled) return;
      setPlanes(generateChunkPlanesCached(cx, cy, cz));
    };

    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(run, { timeout: IDLE_CALLBACK_TIMEOUT });
      return () => {
        canceled = true;
        cancelIdleCallback(id);
      };
    }

    const id = setTimeout(run, 0);
    return () => {
      canceled = true;
      clearTimeout(id);
    };
  }, [cx, cy, cz]);

  if (!planes) return null;

  return (
    <group>
      {planes.map((plane) => {
        const mediaItem = media[plane.mediaIndex % media.length];
        if (!mediaItem) return null;

        return (
          <MediaPlane
            key={plane.id}
            position={plane.position}
            scale={plane.scale}
            media={mediaItem}
            chunkCx={cx}
            chunkCy={cy}
            chunkCz={cz}
            cameraGridRef={cameraGridRef}
          />
        );
      })}
    </group>
  );
}

function SceneController({
  media,
  onFpsUpdate,
  onReady,
  onTextureProgress,
}: {
  media: MediaItem[];
  onFpsUpdate?: (fps: number) => void;
  onReady?: () => void;
  onTextureProgress?: (progress: number) => void;
}) {
  const { camera, gl } = useThree();
  const isTouchDevice = useIsTouchDevice();

  React.useEffect(() => {
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.NoToneMapping;
  }, [gl]);

  const [chunks, setChunks] = React.useState<ChunkData[]>([]);
  const lastChunkKey = React.useRef("");
  const pendingChunkUpdate = React.useRef<{ cx: number; cy: number; cz: number } | null>(null);
  const lastChunkUpdateTime = React.useRef(0);

  const cameraGridRef = React.useRef<CameraGridState>({
    cx: 0,
    cy: 0,
    cz: 0,
    camZ: camera.position.z,
  });

  const { active, progress } = useProgress();
  const readySent = React.useRef(false);
  const maxProgressRef = React.useRef(0);

  React.useEffect(() => {
    const roundedProgress = Math.round(progress);
    if (roundedProgress > maxProgressRef.current) {
      maxProgressRef.current = roundedProgress;
      onTextureProgress?.(maxProgressRef.current);
    }
  }, [progress, onTextureProgress]);

  React.useEffect(() => {
    if (chunks.length > 0 && !readySent.current && !active && progress === 100) {
      const t = setTimeout(() => {
        if (!readySent.current) {
          readySent.current = true;
          onReady?.();
        }
      }, READY_DELAY);
      return () => clearTimeout(t);
    }
  }, [chunks, onReady, active, progress]);

  const velocity = React.useRef({ x: 0, y: 0, z: 0 });
  const targetVel = React.useRef({ x: 0, y: 0, z: 0 });
  const scrollAccum = React.useRef(0);
  const keys = React.useRef(new Set<string>());
  const isDragging = React.useRef(false);
  const mousePosition = React.useRef({ x: 0, y: 0 });
  const driftOffset = React.useRef({ x: 0, y: 0 });
  const basePosition = React.useRef({ x: 0, y: 0, z: INITIAL_CAMERA_Z });
  const lastMouse = React.useRef({ x: 0, y: 0 });
  const lastTouches = React.useRef<Touch[]>([]);
  const lastTouchDist = React.useRef(0);

  const frames = React.useRef(0);
  const lastTime = React.useRef(performance.now());

  React.useEffect(() => {
    const canvas = gl.domElement;
    const originalCursor = canvas.style.cursor;
    canvas.style.cursor = "grab";

    const onKeyDown = (e: KeyboardEvent) => {
      keys.current.add(e.key.toLowerCase());
      if (e.key === " ") e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());

    const onMouseDown = (e: MouseEvent) => {
      isDragging.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      canvas.style.cursor = "grabbing";
    };
    const onMouseUp = () => {
      isDragging.current = false;
      canvas.style.cursor = "grab";
    };
    const onMouseLeave = () => {
      mousePosition.current = { x: 0, y: 0 };
      isDragging.current = false;
      canvas.style.cursor = "grab";
    };
    const onMouseMove = (e: MouseEvent) => {
      const { innerWidth, innerHeight } = window;
      mousePosition.current = {
        x: (e.clientX / innerWidth) * 2 - 1,
        y: -(e.clientY / innerHeight) * 2 + 1,
      };

      if (!isDragging.current) return;
      targetVel.current.x -= (e.clientX - lastMouse.current.x) * MOUSE_DRAG_SENSITIVITY;
      targetVel.current.y += (e.clientY - lastMouse.current.y) * MOUSE_DRAG_SENSITIVITY;
      lastMouse.current = { x: e.clientX, y: e.clientY };
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      scrollAccum.current += e.deltaY * WHEEL_SCROLL_SENSITIVITY;
    };

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      lastTouches.current = Array.from(e.touches) as Touch[];
      lastTouchDist.current = getTouchDistance(lastTouches.current);
      canvas.style.cursor = "grabbing";
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const touches = Array.from(e.touches) as Touch[];

      if (touches.length === 1 && lastTouches.current.length >= 1) {
        const [touch] = touches;
        const [lastTouch] = lastTouches.current;
        if (touch && lastTouch) {
          targetVel.current.x -= (touch.clientX - lastTouch.clientX) * TOUCH_DRAG_SENSITIVITY;
          targetVel.current.y += (touch.clientY - lastTouch.clientY) * TOUCH_DRAG_SENSITIVITY;
        }
        lastTouches.current = touches;
        return;
      }

      if (touches.length === 2) {
        const dist = getTouchDistance(touches);
        if (lastTouchDist.current > 0) {
          scrollAccum.current += (lastTouchDist.current - dist) * TOUCH_PINCH_SENSITIVITY;
        }
        lastTouchDist.current = dist;
      }

      lastTouches.current = touches;
    };

    const onTouchEnd = (e: TouchEvent) => {
      lastTouches.current = Array.from(e.touches) as Touch[];
      lastTouchDist.current = getTouchDistance(lastTouches.current);
      canvas.style.cursor = "grab";
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseleave", onMouseLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseleave", onMouseLeave);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.style.cursor = originalCursor;
    };
  }, [gl]);

  useFrame(() => {
    frames.current += 1;
    const now = performance.now();
    if (now - lastTime.current >= FPS_UPDATE_INTERVAL) {
      const fps = Math.round(frames.current / ((now - lastTime.current) / 1000));
      onFpsUpdate?.(fps);
      frames.current = 0;
      lastTime.current = now;
    }

    const k = keys.current;

    if (k.has("w") || k.has("arrowup")) targetVel.current.z -= KEYBOARD_SPEED;
    if (k.has("s") || k.has("arrowdown")) targetVel.current.z += KEYBOARD_SPEED;
    if (k.has("a") || k.has("arrowleft")) targetVel.current.x -= KEYBOARD_SPEED;
    if (k.has("d") || k.has("arrowright")) targetVel.current.x += KEYBOARD_SPEED;
    if (k.has("q")) targetVel.current.y -= KEYBOARD_SPEED;
    if (k.has("e")) targetVel.current.y += KEYBOARD_SPEED;
    if (k.has(" ")) targetVel.current.z -= KEYBOARD_SPEED * SPACE_SPEED_MULTIPLIER;

    const isZooming = Math.abs(velocity.current.z) > ZOOMING_THRESHOLD;
    const currentZ = basePosition.current.z;
    const zoomFactor = Math.max(ZOOM_FACTOR_MIN, Math.min(ZOOM_FACTOR_MAX, currentZ / ZOOM_FACTOR_BASE));

    const driftAmount = MAX_DRIFT * zoomFactor;
    const targetDriftX = !isDragging.current && !isTouchDevice ? mousePosition.current.x * driftAmount : 0;
    const targetDriftY = !isDragging.current && !isTouchDevice ? mousePosition.current.y * driftAmount : 0;

    const driftLerpFactor = isZooming ? DRIFT_LERP_ZOOMING : DRIFT_LERP_NORMAL;
    driftOffset.current.x = lerp(driftOffset.current.x, targetDriftX, driftLerpFactor);
    driftOffset.current.y = lerp(driftOffset.current.y, targetDriftY, driftLerpFactor);

    targetVel.current.z += scrollAccum.current;
    scrollAccum.current *= SCROLL_ACCUM_DECAY;

    targetVel.current.x = clamp(targetVel.current.x, -MAX_VELOCITY, MAX_VELOCITY);
    targetVel.current.y = clamp(targetVel.current.y, -MAX_VELOCITY, MAX_VELOCITY);
    targetVel.current.z = clamp(targetVel.current.z, -MAX_VELOCITY, MAX_VELOCITY);

    velocity.current.x = lerp(velocity.current.x, targetVel.current.x, VELOCITY_LERP);
    velocity.current.y = lerp(velocity.current.y, targetVel.current.y, VELOCITY_LERP);
    velocity.current.z = lerp(velocity.current.z, targetVel.current.z, VELOCITY_LERP);

    basePosition.current.x += velocity.current.x;
    basePosition.current.y += velocity.current.y;
    basePosition.current.z += velocity.current.z;

    camera.position.x = basePosition.current.x + driftOffset.current.x;
    camera.position.y = basePosition.current.y + driftOffset.current.y;
    camera.position.z = basePosition.current.z;

    targetVel.current.x *= VELOCITY_DECAY;
    targetVel.current.y *= VELOCITY_DECAY;
    targetVel.current.z *= VELOCITY_DECAY;

    const cx = Math.floor(basePosition.current.x / CHUNK_SIZE);
    const cy = Math.floor(basePosition.current.y / CHUNK_SIZE);
    const cz = Math.floor(basePosition.current.z / CHUNK_SIZE);

    cameraGridRef.current.cx = cx;
    cameraGridRef.current.cy = cy;
    cameraGridRef.current.cz = cz;
    cameraGridRef.current.camZ = basePosition.current.z;

    const key = `${cx},${cy},${cz}`;
    if (key !== lastChunkKey.current) {
      pendingChunkUpdate.current = { cx, cy, cz };
      lastChunkKey.current = key;
    }

    const zoomSpeed = Math.abs(velocity.current.z);
    const throttleMs = getChunkUpdateThrottleMs(isZooming, zoomSpeed);
    const chunkNow = performance.now();

    if (pendingChunkUpdate.current && shouldThrottleUpdate(lastChunkUpdateTime.current, throttleMs, chunkNow)) {
      lastChunkUpdateTime.current = chunkNow;
      const { cx: updateCx, cy: updateCy, cz: updateCz } = pendingChunkUpdate.current;
      pendingChunkUpdate.current = null;

      React.startTransition(() => {
        setTimeout(() => {
          setChunks(() => {
            const nextChunks: ChunkData[] = [];
            for (const offset of CHUNK_OFFSETS) {
              const keyChunk = `${updateCx + offset.dx},${updateCy + offset.dy},${updateCz + offset.dz}`;
              nextChunks.push({
                key: keyChunk,
                cx: updateCx + offset.dx,
                cy: updateCy + offset.dy,
                cz: updateCz + offset.dz,
              });
            }
            return nextChunks;
          });
        }, 0);
      });
    }
  });

  React.useEffect(() => {
    basePosition.current.x = camera.position.x;
    basePosition.current.y = camera.position.y;
    basePosition.current.z = camera.position.z;

    const initialChunks: ChunkData[] = CHUNK_OFFSETS.map((offset) => ({
      key: `${offset.dx},${offset.dy},${offset.dz}`,
      cx: offset.dx,
      cy: offset.dy,
      cz: offset.dz,
    }));

    setChunks(initialChunks);
  }, []);

  return (
    <>
      {chunks.map((chunk) => (
        <Chunk key={chunk.key} cx={chunk.cx} cy={chunk.cy} cz={chunk.cz} media={media} cameraGridRef={cameraGridRef} />
      ))}
    </>
  );
}

export function InfiniteCanvasScene({
  media,
  onReady,
  onTextureProgress,
  showFps = false,
  showControls = true,
  cameraFov = 60,
  cameraNear = 1,
  cameraFar = 500,
  fogNear = 120,
  fogFar = 320,
  backgroundColor = "#ffffff",
  fogColor = "#ffffff",
}: InfiniteCanvasProps) {
  const [fps, setFps] = React.useState(0);
  const isTouchDevice = useIsTouchDevice();

  const dpr = run(() => {
    const max = isTouchDevice ? DPR_MAX_TOUCH : DPR_MAX_DESKTOP;
    return Math.min(window.devicePixelRatio || 1, max);
  });

  if (!media.length) return null;

  return (
    <div className={styles.container}>
      <Canvas
        camera={{ position: [0, 0, INITIAL_CAMERA_Z], fov: cameraFov, near: cameraNear, far: cameraFar }}
        dpr={dpr}
        gl={{
          antialias: false,
          powerPreference: "high-performance",
        }}
        className={styles.canvas}
      >
        <color attach="background" args={[backgroundColor]} />
        <fog attach="fog" args={[fogColor, fogNear, fogFar]} />
        <SceneController media={media} onFpsUpdate={setFps} onReady={onReady} onTextureProgress={onTextureProgress} />
      </Canvas>

      {showFps && (
        <div className={styles.infoPanel}>
          <b>{fps} FPS</b> | {media.length} Artworks
        </div>
      )}

      {showControls && (
        <div className={styles.controlsPanel}>
          {isTouchDevice ? (
            <>
              <b>Drag</b> Pan · <b>Pinch</b> Zoom
            </>
          ) : (
            <>
              <b>WASD</b> Move · <b>QE</b> Up/Down · <b>Scroll</b> Zoom
            </>
          )}
        </div>
      )}
    </div>
  );
}
