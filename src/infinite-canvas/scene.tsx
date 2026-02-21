import { KeyboardControls, Stats, useKeyboardControls, useProgress } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as React from "react";
import * as THREE from "three";
import { useIsTouchDevice } from "~/src/use-is-touch-device";
import { clamp, lerp } from "~/src/utils";
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
import type { ChunkData, InfiniteCanvasProps, MediaItem, PlaneData } from "./types";
import { generateChunkPlanesCached, getChunkUpdateThrottleMs, shouldThrottleUpdate } from "./utils";

const PLANE_GEOMETRY = new THREE.PlaneGeometry(1, 1);

type FocusState = { coverage: number; color: THREE.Color; mediaUrl: string };

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
}: {
  position: THREE.Vector3;
  scale: THREE.Vector3;
  media: MediaItem;
  chunkCx: number;
  chunkCy: number;
  chunkCz: number;
  cameraGridRef: React.RefObject<CameraGridState>;
  focusRef: React.RefObject<FocusState>;
}) {
  const camera = useThree((s) => s.camera);
  const meshRef = React.useRef<THREE.Mesh>(null);
  const materialRef = React.useRef<THREE.MeshBasicMaterial>(null);
  const localState = React.useRef({ opacity: 0, frame: 0, ready: false });

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
      material.opacity = 0;
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
    material.opacity = isFullyOpaque ? 1 : state.opacity;
    material.depthWrite = isFullyOpaque;
    mesh.visible = state.opacity > INVIS_THRESHOLD;

    if (state.opacity > 0.3 && material.map) {
      const halfW = mesh.scale.x / 2;
      const halfH = mesh.scale.y / 2;
      _projMin.set(position.x - halfW, position.y - halfH, position.z).project(camera);
      _projMax.set(position.x + halfW, position.y + halfH, position.z).project(camera);
      const w = clamp(_projMax.x, -1, 1) - clamp(_projMin.x, -1, 1);
      const h = clamp(_projMax.y, -1, 1) - clamp(_projMin.y, -1, 1);
      const coverage = (Math.abs(w) * Math.abs(h)) / 4;
      if (coverage > 0.3 && coverage > focusRef.current.coverage) {
        const color = getDominantColor(media, material.map);
        if (color) {
          focusRef.current.coverage = coverage;
          focusRef.current.color = color;
          focusRef.current.mediaUrl = media.url;
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
      material.opacity = 0;
      material.depthWrite = false;
      material.map = null;
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

    material.map = texture;
    material.opacity = state.opacity;
    material.depthWrite = state.opacity >= 1;
    mesh.scale.copy(displayScale);
  }, [displayScale, texture, isReady]);

  if (!texture || !isReady) {
    return null;
  }

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
  focusRef,
}: {
  cx: number;
  cy: number;
  cz: number;
  media: MediaItem[];
  cameraGridRef: React.RefObject<CameraGridState>;
  focusRef: React.RefObject<FocusState>;
}) {
  const [planes, setPlanes] = React.useState<PlaneData[] | null>(null);

  React.useEffect(() => {
    let canceled = false;
    const run = () => !canceled && setPlanes(generateChunkPlanesCached(cx, cy, cz));

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
  }, [cx, cy, cz]);

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

const WHITE = new THREE.Color("#ffffff");

// --- Emoji Background System ---

const COLOR_EMOJIS: Record<string, string[]> = {
  red: ["❤️", "🌹", "🍎", "🍒", "🌶️", "💃", "🦞", "🍓", "🥀", "🫀"],
  orange: ["🍊", "🧡", "🥕", "🦊", "🎃", "🦁", "🍑", "🥭", "🔥", "🏵️"],
  yellow: ["⭐", "💛", "🌻", "🍋", "🐝", "🌟", "🏆", "🍌", "🌕", "✨"],
  green: ["🌿", "💚", "🌲", "🍀", "🐸", "🌱", "🥝", "🥒", "🦎", "🍃"],
  blue: ["💙", "🌊", "🦋", "🐳", "🫧", "🧊", "💎", "🌀", "🐟", "🦕"],
  purple: ["💜", "🔮", "🍇", "🦄", "🌸", "💐", "🎆", "🪻", "🍆", "🦑"],
  pink: ["💗", "🌺", "🦩", "🎀", "🌷", "🩷", "🧁", "💅", "🩰", "🫶"],
  neutral: ["⭐", "✨", "💫", "🌟", "☁️", "🤍", "🕊️", "❄️", "💎", "🦢"],
};

const getColorCategory = (color: THREE.Color): string => {
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  if (hsl.s < 0.15 || hsl.l > 0.85 || hsl.l < 0.15) return "neutral";
  const deg = hsl.h * 360;
  if (deg < 15 || deg >= 345) return "red";
  if (deg < 45) return "orange";
  if (deg < 70) return "yellow";
  if (deg < 160) return "green";
  if (deg < 250) return "blue";
  if (deg < 300) return "purple";
  return "pink";
};

const emojiCanvasCache = new Map<string, THREE.CanvasTexture>();

const getEmojiTexture = (emoji: string): THREE.CanvasTexture => {
  const cached = emojiCanvasCache.get(emoji);
  if (cached) return cached;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  ctx.font = `${size * 0.8}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, size / 2, size / 2 + size * 0.05);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  emojiCanvasCache.set(emoji, tex);
  return tex;
};

type EmojiInstance = {
  emoji: string;
  x: number;
  y: number;
  z: number;
  size: number;
  rotSpeed: number;
  floatPhase: number;
  floatAmp: number;
};

const EMOJI_COUNT = 10;
const EMOJI_SPREAD = 60;
const EMOJI_DEPTH_OFFSET = 25;

function EmojiSprite({
  instance,
  camPos,
  opacity,
}: {
  instance: EmojiInstance;
  camPos: React.RefObject<{ x: number; y: number; z: number }>;
  opacity: React.RefObject<number>;
}) {
  const spriteRef = React.useRef<THREE.Sprite>(null);
  const materialRef = React.useRef<THREE.SpriteMaterial>(null);
  const texture = React.useMemo(() => getEmojiTexture(instance.emoji), [instance.emoji]);

  useFrame(({ clock }) => {
    const sprite = spriteRef.current;
    const material = materialRef.current;
    if (!sprite || !material) return;

    const t = clock.getElapsedTime();
    const cam = camPos.current;
    sprite.position.set(
      cam.x + instance.x,
      cam.y + instance.y + Math.sin(t * 0.5 + instance.floatPhase) * instance.floatAmp,
      cam.z - EMOJI_DEPTH_OFFSET + instance.z
    );
    sprite.material.rotation += instance.rotSpeed * 0.01;
    material.opacity = opacity.current;
  });

  return (
    <sprite ref={spriteRef} scale={[instance.size, instance.size, 1]}>
      <spriteMaterial ref={materialRef} map={texture} transparent opacity={0} depthWrite={false} />
    </sprite>
  );
}

function EmojiBackground({
  focusRef,
  basePosRef,
}: {
  focusRef: React.RefObject<FocusState>;
  basePosRef: React.RefObject<{ x: number; y: number; z: number }>;
}) {
  const [instances, setInstances] = React.useState<EmojiInstance[]>([]);
  const lastMediaUrl = React.useRef("");
  const opacityRef = React.useRef(0);
  const targetOpacity = React.useRef(0);

  useFrame(() => {
    const focus = focusRef.current;
    const category = focus.coverage > 0.3 ? getColorCategory(focus.color) : "neutral";

    if (focus.mediaUrl && focus.mediaUrl !== lastMediaUrl.current && focus.coverage > 0.3) {
      lastMediaUrl.current = focus.mediaUrl;
      targetOpacity.current = 0;
    }

    opacityRef.current = lerp(opacityRef.current, targetOpacity.current, 0.04);

    if (opacityRef.current < 0.01 && targetOpacity.current === 0) {
      const emojis = COLOR_EMOJIS[category] ?? COLOR_EMOJIS.neutral;
      const newInstances: EmojiInstance[] = [];
      for (let i = 0; i < EMOJI_COUNT; i++) {
        const angle = (i / EMOJI_COUNT) * Math.PI * 2 + Math.random() * 0.5;
        const radius = EMOJI_SPREAD * 0.4 + Math.random() * EMOJI_SPREAD * 0.6;
        newInstances.push({
          emoji: emojis[Math.floor(Math.random() * emojis.length)],
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
          z: -10 + Math.random() * -20,
          size: 3 + Math.random() * 4,
          rotSpeed: (Math.random() - 0.5) * 2,
          floatPhase: Math.random() * Math.PI * 2,
          floatAmp: 0.5 + Math.random() * 1.5,
        });
      }
      setInstances(newInstances);
      targetOpacity.current = 0.7;
    }
  });

  return (
    <>
      {instances.map((inst, i) => (
        <EmojiSprite key={`${inst.emoji}-${i}`} instance={inst} camPos={basePosRef} opacity={opacityRef} />
      ))}
    </>
  );
}

// --- End Emoji Background System ---

// --- Random Shape Background System ---

type ShapeType = "blob" | "star" | "polygon" | "wave" | "composed";

const shapeCanvasCache = new Map<string, THREE.CanvasTexture>();

const generateBlobPath = (ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, seed: number) => {
  const points = 8 + Math.floor(seed * 6); // 8-13 control points
  ctx.beginPath();
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const noise = 0.5 + ((Math.sin(seed * 100 + i * 3.7) * 0.5 + 0.5) * 0.8 + 0.2) * 0.5;
    const r = radius * noise;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      // Smooth curves between points
      const prevAngle = ((i - 0.5) / points) * Math.PI * 2;
      const prevNoise = 0.5 + ((Math.sin(seed * 100 + (i - 0.5) * 3.7) * 0.5 + 0.5) * 0.8 + 0.2) * 0.5;
      const cpR = radius * prevNoise * 1.1;
      const cpx = cx + Math.cos(prevAngle) * cpR;
      const cpy = cy + Math.sin(prevAngle) * cpR;
      ctx.quadraticCurveTo(cpx, cpy, x, y);
    }
  }
  ctx.closePath();
};

const generateStarPath = (ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, seed: number) => {
  const arms = 3 + Math.floor(seed * 5); // 3-7 arms
  const innerRatio = 0.3 + seed * 0.35;
  ctx.beginPath();
  for (let i = 0; i <= arms * 2; i++) {
    const angle = (i / (arms * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? radius : radius * innerRatio;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
};

const generatePolygonPath = (ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, seed: number) => {
  const sides = 3 + Math.floor(seed * 6); // 3-8 sides
  const rotation = seed * Math.PI * 2;
  ctx.beginPath();
  for (let i = 0; i <= sides; i++) {
    const angle = (i / sides) * Math.PI * 2 + rotation;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
};

const generateWavePath = (ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, seed: number) => {
  const lobes = 3 + Math.floor(seed * 4);
  ctx.beginPath();
  const steps = 64;
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const wobble = Math.sin(angle * lobes + seed * 10) * 0.35 + 0.65;
    const r = radius * wobble;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
};

const generateComposedPath = (ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, seed: number) => {
  // Overlapping circles to create organic composed shapes
  const count = 2 + Math.floor(seed * 3);
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + seed * 5;
    const dist = radius * 0.3;
    const r = radius * (0.5 + ((Math.sin(seed * 77 + i * 2.3) + 1) / 2) * 0.4);
    const ox = cx + Math.cos(angle) * dist;
    const oy = cy + Math.sin(angle) * dist;
    ctx.moveTo(ox + r, oy);
    ctx.arc(ox, oy, r, 0, Math.PI * 2);
  }
};

const SHAPE_TYPES: ShapeType[] = ["blob", "star", "polygon", "wave", "composed"];

const generateShapeTexture = (color: THREE.Color, seed: number): THREE.CanvasTexture => {
  const key = `${color.getHexString()}-${seed.toFixed(4)}`;
  const cached = shapeCanvasCache.get(key);
  if (cached) return cached;

  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.38;
  const shapeType = SHAPE_TYPES[Math.floor(seed * 7.3) % SHAPE_TYPES.length];

  // Draw the shape path
  switch (shapeType) {
    case "blob":
      generateBlobPath(ctx, cx, cy, radius, seed);
      break;
    case "star":
      generateStarPath(ctx, cx, cy, radius, seed);
      break;
    case "polygon":
      generatePolygonPath(ctx, cx, cy, radius, seed);
      break;
    case "wave":
      generateWavePath(ctx, cx, cy, radius, seed);
      break;
    case "composed":
      generateComposedPath(ctx, cx, cy, radius, seed);
      break;
  }

  // Create gradient fill using the dominant color
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);

  const gradientType = seed > 0.5 ? "radial" : "linear";
  let gradient: CanvasGradient;

  if (gradientType === "radial") {
    const ox = cx + (seed - 0.5) * radius * 0.6;
    const oy = cy + (Math.sin(seed * 20) * radius * 0.3);
    gradient = ctx.createRadialGradient(ox, oy, 0, cx, cy, radius * 1.2);
  } else {
    const angle = seed * Math.PI * 2;
    const dx = Math.cos(angle) * radius;
    const dy = Math.sin(angle) * radius;
    gradient = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
  }

  // Build gradient stops from the dominant color with hue shifts
  const lightColor = new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * 1.2), Math.min(0.85, hsl.l + 0.3));
  const darkColor = new THREE.Color().setHSL((hsl.h + 0.05) % 1, hsl.s, Math.max(0.15, hsl.l - 0.2));
  const midColor = new THREE.Color().setHSL((hsl.h + 0.02) % 1, Math.min(1, hsl.s * 1.1), hsl.l);

  gradient.addColorStop(0, `#${lightColor.getHexString()}`);
  gradient.addColorStop(0.5, `#${midColor.getHexString()}`);
  gradient.addColorStop(1, `#${darkColor.getHexString()}`);

  ctx.fillStyle = gradient;
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  // Limit cache size
  if (shapeCanvasCache.size > 64) {
    const firstKey = shapeCanvasCache.keys().next().value;
    if (firstKey) {
      shapeCanvasCache.get(firstKey)?.dispose();
      shapeCanvasCache.delete(firstKey);
    }
  }

  shapeCanvasCache.set(key, tex);
  return tex;
};

type ShapeInstance = {
  seed: number;
  x: number;
  y: number;
  z: number;
  size: number;
  rotSpeed: number;
  floatPhase: number;
  floatAmp: number;
};

const SHAPE_COUNT = 8;
const SHAPE_SPREAD = 70;
const SHAPE_DEPTH_OFFSET = 30;

function ShapeSprite({
  instance,
  camPos,
  opacity,
  color,
}: {
  instance: ShapeInstance;
  camPos: React.RefObject<{ x: number; y: number; z: number }>;
  opacity: React.RefObject<number>;
  color: React.RefObject<THREE.Color>;
}) {
  const spriteRef = React.useRef<THREE.Sprite>(null);
  const materialRef = React.useRef<THREE.SpriteMaterial>(null);
  const textureRef = React.useRef<THREE.CanvasTexture | null>(null);
  const lastColorHex = React.useRef("");

  useFrame(({ clock }) => {
    const sprite = spriteRef.current;
    const material = materialRef.current;
    if (!sprite || !material) return;

    const t = clock.getElapsedTime();
    const cam = camPos.current;
    sprite.position.set(
      cam.x + instance.x,
      cam.y + instance.y + Math.sin(t * 0.3 + instance.floatPhase) * instance.floatAmp,
      cam.z - SHAPE_DEPTH_OFFSET + instance.z
    );
    sprite.material.rotation += instance.rotSpeed * 0.005;
    material.opacity = opacity.current * 0.5; // Shapes are more subtle than emojis

    // Update texture when color changes significantly
    const hex = color.current.getHexString();
    if (hex !== lastColorHex.current) {
      lastColorHex.current = hex;
      textureRef.current = generateShapeTexture(color.current, instance.seed);
      material.map = textureRef.current;
      material.needsUpdate = true;
    }
  });

  return (
    <sprite ref={spriteRef} scale={[instance.size, instance.size, 1]}>
      <spriteMaterial ref={materialRef} transparent opacity={0} depthWrite={false} />
    </sprite>
  );
}

function ShapeBackground({
  focusRef,
  basePosRef,
}: {
  focusRef: React.RefObject<FocusState>;
  basePosRef: React.RefObject<{ x: number; y: number; z: number }>;
}) {
  const [instances, setInstances] = React.useState<ShapeInstance[]>([]);
  const opacityRef = React.useRef(0);
  const targetOpacity = React.useRef(0);
  const colorRef = React.useRef(new THREE.Color("#ffffff"));
  const lastMediaUrl = React.useRef("");

  // Generate instances once on mount
  React.useEffect(() => {
    const newInstances: ShapeInstance[] = [];
    for (let i = 0; i < SHAPE_COUNT; i++) {
      const angle = (i / SHAPE_COUNT) * Math.PI * 2 + Math.random() * 0.8;
      const radius = SHAPE_SPREAD * 0.3 + Math.random() * SHAPE_SPREAD * 0.7;
      newInstances.push({
        seed: Math.random(),
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        z: -15 + Math.random() * -25,
        size: 5 + Math.random() * 8,
        rotSpeed: (Math.random() - 0.5) * 1.5,
        floatPhase: Math.random() * Math.PI * 2,
        floatAmp: 0.3 + Math.random() * 1.0,
      });
    }
    setInstances(newInstances);
  }, []);

  useFrame(() => {
    const focus = focusRef.current;

    if (focus.mediaUrl && focus.mediaUrl !== lastMediaUrl.current && focus.coverage > 0.3) {
      lastMediaUrl.current = focus.mediaUrl;
      targetOpacity.current = 0;
    }

    opacityRef.current = lerp(opacityRef.current, targetOpacity.current, 0.04);

    if (opacityRef.current < 0.01 && targetOpacity.current === 0) {
      // Regenerate positions when transitioning
      const newInstances: ShapeInstance[] = [];
      for (let i = 0; i < SHAPE_COUNT; i++) {
        const angle = (i / SHAPE_COUNT) * Math.PI * 2 + Math.random() * 0.8;
        const radius = SHAPE_SPREAD * 0.3 + Math.random() * SHAPE_SPREAD * 0.7;
        newInstances.push({
          seed: Math.random(),
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
          z: -15 + Math.random() * -25,
          size: 5 + Math.random() * 8,
          rotSpeed: (Math.random() - 0.5) * 1.5,
          floatPhase: Math.random() * Math.PI * 2,
          floatAmp: 0.3 + Math.random() * 1.0,
        });
      }
      setInstances(newInstances);
      colorRef.current.copy(focus.color);
      targetOpacity.current = 0.7;
    }
  });

  return (
    <>
      {instances.map((inst, i) => (
        <ShapeSprite key={`shape-${i}`} instance={inst} camPos={basePosRef} opacity={opacityRef} color={colorRef} />
      ))}
    </>
  );
}

// --- End Random Shape Background System ---

function BackgroundUpdater({ focusRef }: { focusRef: React.RefObject<FocusState> }) {
  const scene = useThree((s) => s.scene);
  const currentColor = React.useRef(new THREE.Color("#ffffff"));

  useFrame(() => {
    const focus = focusRef.current;
    const cur = currentColor.current;

    if (focus.coverage > 0.5) {
      cur.lerp(focus.color, 0.05);
    } else {
      cur.lerp(WHITE, 0.05);
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

function SceneController({ media, onTextureProgress }: { media: MediaItem[]; onTextureProgress?: (progress: number) => void }) {
  const { camera, gl } = useThree();
  const isTouchDevice = useIsTouchDevice();
  const [, getKeys] = useKeyboardControls<keyof KeyboardKeys>();

  const state = React.useRef<ControllerState>(createInitialState(INITIAL_CAMERA_Z));
  const cameraGridRef = React.useRef<CameraGridState>({ cx: 0, cy: 0, cz: 0, camZ: camera.position.z });
  const focusRef = React.useRef<FocusState>({ coverage: 0, color: new THREE.Color("#ffffff"), mediaUrl: "" });
  const basePosRef = React.useRef({ x: 0, y: 0, z: INITIAL_CAMERA_Z });

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
    basePosRef.current = s.basePos;

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
        />
      ))}
      <BackgroundUpdater focusRef={focusRef} />
      <EmojiBackground focusRef={focusRef} basePosRef={basePosRef} />
      <ShapeBackground focusRef={focusRef} basePosRef={basePosRef} />
    </>
  );
}

export function InfiniteCanvasScene({
  media,
  onTextureProgress,
  showFps = false,
  showControls = false,
  cameraFov = 60,
  cameraNear = 1,
  cameraFar = 500,
  fogNear = 120,
  fogFar = 320,
  backgroundColor = "#ffffff",
  fogColor = "#ffffff",
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
          <SceneController media={media} onTextureProgress={onTextureProgress} />
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
