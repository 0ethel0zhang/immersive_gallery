import { KeyboardControls, Stats, useKeyboardControls, useProgress } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as React from "react";
import * as THREE from "three";
import { useEffects } from "~/src/copilot/effects-context";
import type { FilterType, PlaneFrame, PlaneOverlay } from "~/src/copilot/effects-store";
import { useIsTouchDevice } from "~/src/use-is-touch-device";
import { clamp, lerp } from "~/src/utils";
import { FrameDecoration } from "./frame-decoration";
import { OverlayEffect } from "./overlay-effect";
import {
  CHUNK_FADE_MARGIN,
  CHUNK_OFFSETS,
  CHUNK_SIZE,
  DEPTH_FADE_END,
  DEPTH_FADE_START,
  INITIAL_CAMERA_Z,
  INVIS_THRESHOLD,
  KEYBOARD_SPEED,
  MAX_VELOCITY,
  RENDER_DISTANCE,
  VELOCITY_DECAY,
  VELOCITY_LERP,
} from "./constants";
import styles from "./style.module.css";
import { getDominantColor, getTexture } from "./texture-manager";
import { FocusEffects3D } from "./focus-effects-3d";
import { DEFAULT_LAYOUT_PARAMS } from "./types";
import type { ChunkData, InfiniteCanvasProps, LayoutParams, MediaItem, PlaneData } from "./types";

const FOCUS_CALLBACK_THROTTLE_MS = 100;
import { clearPlaneCache, generateChunkPlanesCached, getChunkUpdateThrottleMs, shouldThrottleUpdate } from "./utils";

const PLANE_GEOMETRY = new THREE.PlaneGeometry(1, 1);

const FILTER_TYPE_MAP: Record<FilterType, number> = {
  grayscale: 1,
  sepia: 2,
  invert: 3,
  saturate: 4,
  warm: 5,
  cool: 6,
  vintage: 7,
  brightness: 8,
  contrast: 9,
};

const VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D map;
uniform float opacity;
uniform int filterType;
uniform float filterIntensity;
varying vec2 vUv;

void main() {
  vec4 texColor = texture2D(map, vUv);
  vec3 color = texColor.rgb;
  vec3 filtered = color;

  if (filterType == 1) {
    // grayscale
    float gray = dot(color, vec3(0.299, 0.587, 0.114));
    filtered = vec3(gray);
  } else if (filterType == 2) {
    // sepia
    float gray = dot(color, vec3(0.299, 0.587, 0.114));
    filtered = vec3(gray * 1.2, gray * 1.0, gray * 0.8);
  } else if (filterType == 3) {
    // invert
    filtered = 1.0 - color;
  } else if (filterType == 4) {
    // saturate
    float gray = dot(color, vec3(0.299, 0.587, 0.114));
    filtered = mix(vec3(gray), color, 1.0 + filterIntensity);
  } else if (filterType == 5) {
    // warm
    filtered = vec3(color.r + 0.15 * filterIntensity, color.g + 0.05 * filterIntensity, color.b - 0.1 * filterIntensity);
  } else if (filterType == 6) {
    // cool
    filtered = vec3(color.r - 0.1 * filterIntensity, color.g + 0.05 * filterIntensity, color.b + 0.15 * filterIntensity);
  } else if (filterType == 7) {
    // vintage
    float gray = dot(color, vec3(0.299, 0.587, 0.114));
    vec3 tint = vec3(gray * 1.1, gray * 0.95, gray * 0.75);
    float dist = distance(vUv, vec2(0.5));
    float vignette = smoothstep(0.8, 0.3, dist);
    filtered = tint * vignette;
  } else if (filterType == 8) {
    // brightness
    filtered = color * (1.0 + filterIntensity);
  } else if (filterType == 9) {
    // contrast
    filtered = (color - 0.5) * (1.0 + filterIntensity) + 0.5;
  }

  if (filterType > 0 && filterType != 4) {
    filtered = mix(color, filtered, filterIntensity);
  }

  filtered = clamp(filtered, 0.0, 1.0);
  gl_FragColor = vec4(filtered, texColor.a * opacity);
}
`;

type FocusState = { coverage: number; color: THREE.Color; effectBlend: number };

const _projMin = new THREE.Vector3();
const _projMax = new THREE.Vector3();

const KEYBOARD_MAP = [
  { name: "forward", keys: ["w", "W", "ArrowUp"] },
  { name: "backward", keys: ["s", "S", "ArrowDown"] },
  { name: "left", keys: ["a", "A", "ArrowLeft"] },
  { name: "right", keys: ["d", "D", "ArrowRight"] },
  { name: "up", keys: ["e", "E"] },
  { name: "down", keys: ["q", "Q"] },
];

type KeyboardKeys = {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
};

const getTouchDistance = (touches: Touch[]) => {
  if (touches.length < 2) {
    return 0;
  }

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
  focusRef,
  planeId,
}: {
  position: THREE.Vector3;
  scale: THREE.Vector3;
  media: MediaItem;
  chunkCx: number;
  chunkCy: number;
  chunkCz: number;
  cameraGridRef: React.RefObject<CameraGridState>;
  focusRef: React.RefObject<FocusState>;
  planeId: string;
}) {
  const camera = useThree((s) => s.camera);
  const meshRef = React.useRef<THREE.Mesh>(null);
  const materialRef = React.useRef<THREE.ShaderMaterial>(null);
  const localState = React.useRef({ opacity: 0, frame: 0, ready: false });
  const { stateRef, revision } = useEffects();

  const shaderMaterial = React.useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        uniforms: {
          map: { value: null },
          opacity: { value: 0 },
          filterType: { value: 0 },
          filterIntensity: { value: 0 },
        },
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [],
  );

  const [texture, setTexture] = React.useState<THREE.Texture | null>(null);
  const [isReady, setIsReady] = React.useState(false);

  useFrame(() => {
    const material = materialRef.current;
    const mesh = meshRef.current;
    const state = localState.current;

    if (!material || !mesh) {
      return;
    }

    state.frame = (state.frame + 1) & 1;

    if (state.opacity < INVIS_THRESHOLD && !mesh.visible && state.frame === 0) {
      return;
    }

    const cam = cameraGridRef.current;
    const dist = Math.max(Math.abs(chunkCx - cam.cx), Math.abs(chunkCy - cam.cy), Math.abs(chunkCz - cam.cz));
    const absDepth = Math.abs(position.z - cam.camZ);

    if (absDepth > DEPTH_FADE_END + 50) {
      state.opacity = 0;
      material.uniforms.opacity.value = 0;
      material.depthWrite = false;
      mesh.visible = false;
      return;
    }

    const gridFade =
      dist <= RENDER_DISTANCE ? 1 : Math.max(0, 1 - (dist - RENDER_DISTANCE) / Math.max(CHUNK_FADE_MARGIN, 0.0001));

    const depthFade =
      absDepth <= DEPTH_FADE_START
        ? 1
        : Math.max(0, 1 - (absDepth - DEPTH_FADE_START) / Math.max(DEPTH_FADE_END - DEPTH_FADE_START, 0.0001));

    const target = Math.min(gridFade, depthFade * depthFade);

    state.opacity = target < INVIS_THRESHOLD && state.opacity < INVIS_THRESHOLD ? 0 : lerp(state.opacity, target, 0.18);

    const isFullyOpaque = state.opacity > 0.99;
    material.uniforms.opacity.value = isFullyOpaque ? 1 : state.opacity;
    material.depthWrite = isFullyOpaque;
    mesh.visible = state.opacity > INVIS_THRESHOLD;

    const filter = stateRef.current.filters.get(planeId) ?? stateRef.current.filters.get("__default__") ?? null;
    if (filter) {
      material.uniforms.filterType.value = FILTER_TYPE_MAP[filter.type] ?? 0;
      material.uniforms.filterIntensity.value = filter.intensity;
    } else {
      material.uniforms.filterType.value = 0;
      material.uniforms.filterIntensity.value = 0;
    }

    if (state.opacity > 0.3 && material.uniforms.map.value) {
      const halfW = mesh.scale.x / 2;
      const halfH = mesh.scale.y / 2;
      _projMin.set(position.x - halfW, position.y - halfH, position.z).project(camera);
      _projMax.set(position.x + halfW, position.y + halfH, position.z).project(camera);
      const w = clamp(_projMax.x, -1, 1) - clamp(_projMin.x, -1, 1);
      const h = clamp(_projMax.y, -1, 1) - clamp(_projMin.y, -1, 1);
      const coverage = (Math.abs(w) * Math.abs(h)) / 4;
      if (coverage > 0.3 && coverage > focusRef.current.coverage) {
        const color = getDominantColor(media, material.uniforms.map.value);
        if (color) {
          focusRef.current.coverage = coverage;
          focusRef.current.color = color;
        }
      }
    }
  });

  // Calculate display scale from media dimensions (from manifest)
  const displayScale = React.useMemo(() => {
    if (media.width && media.height) {
      const aspect = media.width / media.height;
      return new THREE.Vector3(scale.y * aspect, scale.y, 1);
    }

    return scale;
  }, [media.width, media.height, scale]);

  // Load texture with onLoad callback
  React.useEffect(() => {
    const state = localState.current;
    state.ready = false;
    state.opacity = 0;
    setIsReady(false);

    const material = materialRef.current;

    if (material) {
      material.uniforms.opacity.value = 0;
      material.depthWrite = false;
      material.uniforms.map.value = null;
    }

    const tex = getTexture(media, () => {
      state.ready = true;
      setIsReady(true);
    });

    setTexture(tex);
  }, [media]);

  // Apply texture when ready
  React.useEffect(() => {
    const material = materialRef.current;
    const mesh = meshRef.current;
    const state = localState.current;

    if (!material || !mesh || !texture || !isReady || !state.ready) {
      return;
    }

    material.uniforms.map.value = texture;
    material.uniforms.opacity.value = state.opacity;
    material.depthWrite = state.opacity >= 1;
    mesh.scale.copy(displayScale);
  }, [displayScale, texture, isReady]);

  const [frame, setFrame] = React.useState<PlaneFrame | null>(null);
  const [overlay, setOverlay] = React.useState<PlaneOverlay | null>(null);

  React.useEffect(() => {
    setFrame(stateRef.current.frames.get(planeId) ?? stateRef.current.frames.get("__default__") ?? null);
    setOverlay(stateRef.current.overlays.get(planeId) ?? stateRef.current.overlays.get("__default__") ?? null);
  }, [revision, planeId, stateRef]);


  if (!texture || !isReady) {
    return null;
  }

  return (
    <group position={position}>
      <mesh ref={meshRef} scale={displayScale} visible={false} geometry={PLANE_GEOMETRY}>
        <primitive object={shaderMaterial} ref={materialRef} attach="material" />
      </mesh>
      {frame && <FrameDecoration frame={frame} width={displayScale.x} height={displayScale.y} opacityRef={localState} />}
      {overlay && <OverlayEffect overlay={overlay} width={displayScale.x} height={displayScale.y} opacityRef={localState} />}
    </group>
  );
}

function Chunk({
  cx,
  cy,
  cz,
  media,
  cameraGridRef,
  focusRef,
  layoutParams,
}: {
  cx: number;
  cy: number;
  cz: number;
  media: MediaItem[];
  cameraGridRef: React.RefObject<CameraGridState>;
  focusRef: React.RefObject<FocusState>;
  layoutParams: LayoutParams;
}) {
  const [planes, setPlanes] = React.useState<PlaneData[] | null>(null);

  React.useEffect(() => {
    let canceled = false;
    const run = () => !canceled && setPlanes(generateChunkPlanesCached(cx, cy, cz, layoutParams));

    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(run, { timeout: 100 });

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
  }, [cx, cy, cz, layoutParams]);

  if (!planes) {
    return null;
  }

  return (
    <group>
      {planes.map((plane) => {
        const mediaItem = media[plane.mediaIndex % media.length];

        if (!mediaItem) {
          return null;
        }

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
            focusRef={focusRef}
            planeId={plane.id}
          />
        );
      })}
    </group>
  );
}

type ControllerState = {
  velocity: { x: number; y: number; z: number };
  targetVel: { x: number; y: number; z: number };
  basePos: { x: number; y: number; z: number };
  drift: { x: number; y: number };
  mouse: { x: number; y: number };
  lastMouse: { x: number; y: number };
  scrollAccum: number;
  isDragging: boolean;
  lastTouches: Touch[];
  lastTouchDist: number;
  lastChunkKey: string;
  lastChunkUpdate: number;
  pendingChunk: { cx: number; cy: number; cz: number } | null;
};

const createInitialState = (camZ: number): ControllerState => ({
  velocity: { x: 0, y: 0, z: 0 },
  targetVel: { x: 0, y: 0, z: 0 },
  basePos: { x: 0, y: 0, z: camZ },
  drift: { x: 0, y: 0 },
  mouse: { x: 0, y: 0 },
  lastMouse: { x: 0, y: 0 },
  scrollAccum: 0,
  isDragging: false,
  lastTouches: [],
  lastTouchDist: 0,
  lastChunkKey: "",
  lastChunkUpdate: 0,
  pendingChunk: null,
});


function BackgroundUpdater({
  focusRef,
  onFocusChange,
  baseColor,
}: {
  focusRef: React.RefObject<FocusState>;
  onFocusChange?: (color: { r: number; g: number; b: number } | null, coverage: number) => void;
  baseColor: string;
}) {
  const scene = useThree((s) => s.scene);
  const currentColor = React.useRef(new THREE.Color(baseColor));
  const baseColorRef = React.useRef(new THREE.Color(baseColor));
  const lastEmitTime = React.useRef(0);

  React.useEffect(() => {
    baseColorRef.current.set(baseColor);
  }, [baseColor]);

  const EFFECT_BLEND_LERP = 0.05;

  useFrame(() => {
    const focus = focusRef.current;
    const cur = currentColor.current;
    const now = Date.now();

    if (onFocusChange && now - lastEmitTime.current >= FOCUS_CALLBACK_THROTTLE_MS) {
      lastEmitTime.current = now;
      if (focus.coverage > 0.3) {
        onFocusChange(
          { r: focus.color.r, g: focus.color.g, b: focus.color.b },
          focus.coverage
        );
      } else {
        onFocusChange(null, 0);
      }
    }

    const hasFocus = focus.coverage > 0.3;
    focus.effectBlend = hasFocus
      ? Math.min(1, focus.effectBlend + EFFECT_BLEND_LERP)
      : Math.max(0, focus.effectBlend - EFFECT_BLEND_LERP);

    if (focus.coverage > 0.5) {
      cur.lerp(focus.color, EFFECT_BLEND_LERP);
    } else {
      cur.lerp(baseColorRef.current, EFFECT_BLEND_LERP);
    }

    if (scene.background instanceof THREE.Color) {
      scene.background.copy(cur);
    }
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(cur);
    }

    focus.coverage = 0;
  });

  return null;
}

function SceneController({
  media,
  onTextureProgress,
  onFocusChange,
  focusEffectType = "fire",
  layoutParams,
  backgroundColor = "#ffffff",
}: {
  media: MediaItem[];
  onTextureProgress?: (progress: number) => void;
  onFocusChange?: (color: { r: number; g: number; b: number } | null, coverage: number) => void;
  focusEffectType?: "fire" | "cloud" | "flowers";
  layoutParams: LayoutParams;
  backgroundColor?: string;
}) {
  const { camera, gl } = useThree();
  const isTouchDevice = useIsTouchDevice();
  const [, getKeys] = useKeyboardControls<keyof KeyboardKeys>();

  const state = React.useRef<ControllerState>(createInitialState(INITIAL_CAMERA_Z));
  const cameraGridRef = React.useRef<CameraGridState>({ cx: 0, cy: 0, cz: 0, camZ: camera.position.z });
  const focusRef = React.useRef<FocusState>({
    coverage: 0,
    color: new THREE.Color("#ffffff"),
    effectBlend: 0,
  });

  const [chunks, setChunks] = React.useState<ChunkData[]>([]);

  const { progress } = useProgress();
  const maxProgress = React.useRef(0);

  React.useEffect(() => {
    const rounded = Math.round(progress);

    if (rounded > maxProgress.current) {
      maxProgress.current = rounded;
      onTextureProgress?.(rounded);
    }
  }, [progress, onTextureProgress]);

  const prevParamsRef = React.useRef(layoutParams);
  React.useEffect(() => {
    if (prevParamsRef.current !== layoutParams) {
      clearPlaneCache();
      prevParamsRef.current = layoutParams;
    }
  }, [layoutParams]);

  React.useEffect(() => {
    const canvas = gl.domElement;
    const s = state.current;
    canvas.style.cursor = "grab";

    const setCursor = (cursor: string) => {
      canvas.style.cursor = cursor;
    };

    const onMouseDown = (e: MouseEvent) => {
      // Just start dragging - keep drift frozen at current value
      s.isDragging = true;
      s.lastMouse = { x: e.clientX, y: e.clientY };
      setCursor("grabbing");
    };

    const onMouseUp = () => {
      s.isDragging = false;
      setCursor("grab");
    };

    const onMouseLeave = () => {
      s.mouse = { x: 0, y: 0 };
      s.isDragging = false;
      setCursor("grab");
    };

    const onMouseMove = (e: MouseEvent) => {
      s.mouse = {
        x: (e.clientX / window.innerWidth) * 2 - 1,
        y: -(e.clientY / window.innerHeight) * 2 + 1,
      };

      if (s.isDragging) {
        s.targetVel.x -= (e.clientX - s.lastMouse.x) * 0.025;
        s.targetVel.y += (e.clientY - s.lastMouse.y) * 0.025;
        s.lastMouse = { x: e.clientX, y: e.clientY };
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      s.scrollAccum += e.deltaY * 0.006;
    };

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      s.lastTouches = Array.from(e.touches) as Touch[];
      s.lastTouchDist = getTouchDistance(s.lastTouches);
      setCursor("grabbing");
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const touches = Array.from(e.touches) as Touch[];

      if (touches.length === 1 && s.lastTouches.length >= 1) {
        const [touch] = touches;
        const [last] = s.lastTouches;

        if (touch && last) {
          s.targetVel.x -= (touch.clientX - last.clientX) * 0.02;
          s.targetVel.y += (touch.clientY - last.clientY) * 0.02;
        }
      } else if (touches.length === 2 && s.lastTouchDist > 0) {
        const dist = getTouchDistance(touches);
        s.scrollAccum += (s.lastTouchDist - dist) * 0.006;
        s.lastTouchDist = dist;
      }

      s.lastTouches = touches;
    };

    const onTouchEnd = (e: TouchEvent) => {
      s.lastTouches = Array.from(e.touches) as Touch[];
      s.lastTouchDist = getTouchDistance(s.lastTouches);
      setCursor("grab");
    };

    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseleave", onMouseLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });

    return () => {
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseleave", onMouseLeave);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, [gl]);

  useFrame(() => {
    const s = state.current;
    const now = performance.now();

    const { forward, backward, left, right, up, down } = getKeys();
    if (forward) s.targetVel.z -= KEYBOARD_SPEED;
    if (backward) s.targetVel.z += KEYBOARD_SPEED;
    if (left) s.targetVel.x -= KEYBOARD_SPEED;
    if (right) s.targetVel.x += KEYBOARD_SPEED;
    if (down) s.targetVel.y -= KEYBOARD_SPEED;
    if (up) s.targetVel.y += KEYBOARD_SPEED;

    const isZooming = Math.abs(s.velocity.z) > 0.05;
    const zoomFactor = clamp(s.basePos.z / 50, 0.3, 2.0);
    const driftAmount = 8.0 * zoomFactor;
    const driftLerp = isZooming ? 0.2 : 0.12;

    if (s.isDragging) {
      // Freeze drift during drag - keep it at current value
    } else if (isTouchDevice) {
      s.drift.x = lerp(s.drift.x, 0, driftLerp);
      s.drift.y = lerp(s.drift.y, 0, driftLerp);
    } else {
      s.drift.x = lerp(s.drift.x, s.mouse.x * driftAmount, driftLerp);
      s.drift.y = lerp(s.drift.y, s.mouse.y * driftAmount, driftLerp);
    }

    s.targetVel.z += s.scrollAccum;
    s.scrollAccum *= 0.8;

    s.targetVel.x = clamp(s.targetVel.x, -MAX_VELOCITY, MAX_VELOCITY);
    s.targetVel.y = clamp(s.targetVel.y, -MAX_VELOCITY, MAX_VELOCITY);
    s.targetVel.z = clamp(s.targetVel.z, -MAX_VELOCITY, MAX_VELOCITY);

    s.velocity.x = lerp(s.velocity.x, s.targetVel.x, VELOCITY_LERP);
    s.velocity.y = lerp(s.velocity.y, s.targetVel.y, VELOCITY_LERP);
    s.velocity.z = lerp(s.velocity.z, s.targetVel.z, VELOCITY_LERP);

    s.basePos.x += s.velocity.x;
    s.basePos.y += s.velocity.y;
    s.basePos.z += s.velocity.z;

    camera.position.set(s.basePos.x + s.drift.x, s.basePos.y + s.drift.y, s.basePos.z);

    s.targetVel.x *= VELOCITY_DECAY;
    s.targetVel.y *= VELOCITY_DECAY;
    s.targetVel.z *= VELOCITY_DECAY;

    const cx = Math.floor(s.basePos.x / CHUNK_SIZE);
    const cy = Math.floor(s.basePos.y / CHUNK_SIZE);
    const cz = Math.floor(s.basePos.z / CHUNK_SIZE);

    cameraGridRef.current = { cx, cy, cz, camZ: s.basePos.z };

    const key = `${cx},${cy},${cz}`;
    if (key !== s.lastChunkKey) {
      s.pendingChunk = { cx, cy, cz };
      s.lastChunkKey = key;
    }

    const throttleMs = getChunkUpdateThrottleMs(isZooming, Math.abs(s.velocity.z));

    if (s.pendingChunk && shouldThrottleUpdate(s.lastChunkUpdate, throttleMs, now)) {
      const { cx: ucx, cy: ucy, cz: ucz } = s.pendingChunk;
      s.pendingChunk = null;
      s.lastChunkUpdate = now;

      setChunks(
        CHUNK_OFFSETS.map((o) => ({
          key: `${ucx + o.dx},${ucy + o.dy},${ucz + o.dz}`,
          cx: ucx + o.dx,
          cy: ucy + o.dy,
          cz: ucz + o.dz,
        }))
      );
    }
  });

  React.useEffect(() => {
    const s = state.current;
    s.basePos = { x: camera.position.x, y: camera.position.y, z: camera.position.z };

    setChunks(
      CHUNK_OFFSETS.map((o) => ({
        key: `${o.dx},${o.dy},${o.dz}`,
        cx: o.dx,
        cy: o.dy,
        cz: o.dz,
      }))
    );
  }, [camera]);

  return (
    <>
      {chunks.map((chunk) => (
        <Chunk
          key={chunk.key}
          cx={chunk.cx}
          cy={chunk.cy}
          cz={chunk.cz}
          media={media}
          cameraGridRef={cameraGridRef}
          focusRef={focusRef}
          layoutParams={layoutParams}
        />
      ))}
      <FocusEffects3D focusRef={focusRef} effectType={focusEffectType} />
      <BackgroundUpdater focusRef={focusRef} onFocusChange={onFocusChange} baseColor={backgroundColor} />
    </>
  );
}

export function InfiniteCanvasScene({
  media,
  onTextureProgress,
  onFocusChange,
  focusEffectType = "fire",
  showFps = false,
  showControls = false,
  cameraFov = 60,
  cameraNear = 1,
  cameraFar = 500,
  fogNear = 120,
  fogFar = 320,
  backgroundColor = "#ffffff",
  fogColor = "#ffffff",
  layoutParams = DEFAULT_LAYOUT_PARAMS,
}: InfiniteCanvasProps) {
  const isTouchDevice = useIsTouchDevice();
  const dpr = Math.min(window.devicePixelRatio || 1, isTouchDevice ? 1.25 : 1.5);

  if (!media.length) {
    return null;
  }

  return (
    <KeyboardControls map={KEYBOARD_MAP}>
      <div className={styles.container}>
        <Canvas
          camera={{ position: [0, 0, INITIAL_CAMERA_Z], fov: cameraFov, near: cameraNear, far: cameraFar }}
          dpr={dpr}
          flat
          gl={{ antialias: false, powerPreference: "high-performance" }}
          className={styles.canvas}
        >
          <color attach="background" args={[backgroundColor]} />
          <fog attach="fog" args={[fogColor, fogNear, fogFar]} />
          <SceneController
            media={media}
            onTextureProgress={onTextureProgress}
            onFocusChange={onFocusChange}
            focusEffectType={focusEffectType}
            layoutParams={layoutParams}
            backgroundColor={backgroundColor}
          />
          {showFps && <Stats className={styles.stats} />}
        </Canvas>

        {showControls && (
          <div className={styles.controlsPanel}>
            {isTouchDevice ? (
              <>
                <b>Drag</b> Pan · <b>Pinch</b> Zoom
              </>
            ) : (
              <>
                <b>WASD</b> Move · <b>QE</b> Up/Down · <b>Scroll/Space</b> Zoom
              </>
            )}
          </div>
        )}
      </div>
    </KeyboardControls>
  );
}
