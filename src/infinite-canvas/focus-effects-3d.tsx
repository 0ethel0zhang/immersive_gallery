import { useFrame, useThree } from "@react-three/fiber";
import * as React from "react";
import * as THREE from "three";

type FocusState = { coverage: number; color: THREE.Color; effectBlend: number };

const EFFECT_Z_OFFSET = -35;
const BLEND_VISIBLE_THRESHOLD = 0.02;
const FIRE_PARTICLE_COUNT = 100;
const FIRE_RISE_SPEED = 0.06;
const FIRE_FLOAT_AMPLITUDE = 2.5;
const FIRE_FLOAT_SPEED = 0.2;
const FIRE_JITTER = 0.03;
const FIRE_SPREAD = 45;

const EMOJIS_PER_CATEGORY = 8;

function segmentEmojis(s: string): string[] {
  try {
    return [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(s)].map(
      (seg) => seg.segment
    );
  } catch {
    return [...s];
  }
}

const CATEGORY_EMOJI_STRINGS: Record<string, string> = {
  pinkRed:
    "😈💘💝💖💓💞💕💟❣️❤️❤️‍🩹❤️💋🐞🌹🍎🍒🍓🍅🌶️🥩🦞🍷🚨🛑🔥🎈🧧♥️💄🏮🔴🟥💗🩷🧠🌸🌺🌷🎀",
  orange: "🧡🍊🥭🥕🎃📙🟠🟧",
  yellow: "💛🐝🍋🍌🧀🌕🌙🌛🌜☀️🌝🌞⭐🌟⚡🏆🥎📯🔔🟡🟨",
  green: "💚🐊🐢🦎🐍🐲🐉🦗🌲🌳🌴🌵🌿☘️🍀🍏🍐🥑🫑🥒🥬🥦🫛🎄🎋🔋📗💲♻️✅✔️❎🟢🟩",
  blue: "🥶💙🩵💤🐳🐋🐬🐟🧊🌌🌬️🌀❄️💧🌊👖🧢💎📘🧿🅿️🔵🟦",
  purple: "👾💜🍇🫐🍆🟣🟪",
  brown: "🤎🐻🥔🥜🌰🍞🥐🥖🫓🥨🥯🥞🧇🍖🍗🍔🍕🌭🍩🍪🎂🍫🧱🪵🪐🚪🧽⚰️⚱️🟤🟫",
  black: "🖤🕋🎱🎮♠️♣️🕶️🎩🎓💣⚫⬛",
  greyWhite: "👻🤍🤖💨💬🗨️🗯️💭🦢🧂🍙🥛☁️☃️⛄⚾🥋🥼✉️🧻⚪⬜",
};

const CATEGORY_EMOJIS: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const [key, str] of Object.entries(CATEGORY_EMOJI_STRINGS)) {
    out[key] = segmentEmojis(str);
  }
  return out;
})();

function takeEmojisForTextures(category: string): string[] {
  const list = CATEGORY_EMOJIS[category] ?? CATEGORY_EMOJIS.greyWhite;
  const out: string[] = [];
  for (let i = 0; i < EMOJIS_PER_CATEGORY; i++) {
    out.push(list[i % list.length]);
  }
  return out;
}

const EMOJI_SIZE = 64;

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / d + 2) / 6;
      break;
    default:
      h = ((r - g) / d + 4) / 6;
  }
  return { h: h * 360, s, l };
}

function getCategoryFromColor(color: THREE.Color): string {
  const r = color.r * 255;
  const g = color.g * 255;
  const b = color.b * 255;
  const { h, s, l } = rgbToHsl(r, g, b);
  if (l <= 0.12) return "black";
  if (l >= 0.9 || s <= 0.06) return "greyWhite";
  if (l <= 0.45 && l >= 0.18 && h >= 20 && h < 55) return "brown";
  if (h < 15 || h >= 345) return "pinkRed";
  if (h >= 15 && h < 45) return "orange";
  if (h >= 45 && h < 70) return "yellow";
  if (h >= 70 && h < 175) return "green";
  if (h >= 175 && h < 260) return "blue";
  if (h >= 260 && h < 310) return "purple";
  if (h >= 310 && h < 345) return "pinkRed";
  return "greyWhite";
}

function createEmojiTexture(emoji: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = EMOJI_SIZE;
  canvas.height = EMOJI_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.clearRect(0, 0, EMOJI_SIZE, EMOJI_SIZE);
  ctx.font = `${Math.floor(EMOJI_SIZE * 0.85)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, EMOJI_SIZE / 2, EMOJI_SIZE / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

const CATEGORY_TEXTURES: Record<string, THREE.Texture[]> = (() => {
  const out: Record<string, THREE.Texture[]> = {};
  for (const key of Object.keys(CATEGORY_EMOJI_STRINGS)) {
    out[key] = takeEmojisForTextures(key).map(createEmojiTexture);
  }
  return out;
})();

const FALLBACK_CATEGORY = "greyWhite";

function FireEffect({
  focusRef,
  categoryTextures,
}: {
  focusRef: React.RefObject<FocusState>;
  categoryTextures: Record<string, THREE.Texture[]>;
}) {
  const groupRef = React.useRef<THREE.Group>(null);
  const pointsRefs = React.useRef<(THREE.Object3D | null)[]>([]);
  const countPerEmoji = Math.floor(FIRE_PARTICLE_COUNT / EMOJIS_PER_CATEGORY);
  const timeRef = React.useRef(0);
  const baseRefs = React.useRef<{ x: Float32Array; z: Float32Array }[]>([]);

  const geometries = React.useMemo(() => {
    return Array.from({ length: EMOJIS_PER_CATEGORY }, (_, texIndex) => {
      const geo = new THREE.BufferGeometry();
      const n = countPerEmoji;
      const positions = new Float32Array(n * 3);
      const colors = new Float32Array(n * 3);
      const baseX = new Float32Array(n);
      const baseZ = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const px = (Math.random() - 0.5) * 2 * FIRE_SPREAD;
        const py = (Math.random() - 0.5) * FIRE_SPREAD;
        const pz = (Math.random() - 0.5) * 10;
        positions[i * 3] = px;
        positions[i * 3 + 1] = py;
        positions[i * 3 + 2] = pz;
        baseX[i] = px;
        baseZ[i] = pz;
        colors[i * 3] = 1;
        colors[i * 3 + 1] = 1;
        colors[i * 3 + 2] = 1;
      }
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      baseRefs.current[texIndex] = { x: baseX, z: baseZ };
      return geo;
    });
  }, []);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    const focus = focusRef.current;
    const blend = focus.effectBlend ?? 0;
    group.visible = blend > BLEND_VISIBLE_THRESHOLD;
    if (!group.visible) return;

    const category = getCategoryFromColor(focus.color);
    const textures = categoryTextures[category] ?? categoryTextures[FALLBACK_CATEGORY];
    const opacity = blend * 0.72;
    for (let i = 0; i < EMOJIS_PER_CATEGORY; i++) {
      const mesh = pointsRefs.current[i] as THREE.Points | undefined;
      if (mesh?.material) {
        const mat = mesh.material as THREE.PointsMaterial;
        if (textures[i]) mat.map = textures[i];
        mat.opacity = opacity;
      }
    }

    timeRef.current += delta;
    const t = timeRef.current;

    geometries.forEach((geo, texIndex) => {
      const base = baseRefs.current[texIndex];
      if (!base) return;
      const posAttr = geo.getAttribute("position") as THREE.BufferAttribute;
      const pos = posAttr.array as Float32Array;
      const n = countPerEmoji;
      for (let i = 0; i < n; i++) {
        pos[i * 3 + 1] += FIRE_RISE_SPEED * delta * 60;
        if (pos[i * 3 + 1] > FIRE_SPREAD * 0.6) {
          pos[i * 3 + 1] = -FIRE_SPREAD * 0.6;
        }
        const phase = (i / n) * Math.PI * 2 + texIndex;
        const phase2 = phase + 1.3;
        pos[i * 3] = base.x[i] + Math.sin(t * FIRE_FLOAT_SPEED + phase) * FIRE_FLOAT_AMPLITUDE + (Math.random() - 0.5) * FIRE_JITTER;
        pos[i * 3 + 2] = base.z[i] + Math.cos(t * FIRE_FLOAT_SPEED * 0.7 + phase2) * FIRE_FLOAT_AMPLITUDE * 0.6;
      }
      posAttr.needsUpdate = true;
    });
  });

  const defaultTextures = categoryTextures[FALLBACK_CATEGORY];

  return (
    <group ref={groupRef}>
      {geometries.map((geo, i) => (
        <points
          key={i}
          ref={(el) => {
            if (el) pointsRefs.current[i] = el;
          }}
          geometry={geo}
          renderOrder={1000}
        >
          <pointsMaterial
            map={defaultTextures[i]}
            size={4}
            vertexColors
            transparent
            opacity={0.72}
            sizeAttenuation
            depthWrite={false}
          />
        </points>
      ))}
    </group>
  );
}

export function FocusEffects3D({
  focusRef,
}: {
  focusRef: React.RefObject<FocusState>;
  effectType?: "fire" | "cloud" | "flowers";
}) {
  const { camera } = useThree();
  const groupRef = React.useRef<THREE.Group>(null);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    group.position.copy(camera.position);
    group.position.z += EFFECT_Z_OFFSET;
  });

  return (
    <group ref={groupRef}>
      <FireEffect focusRef={focusRef} categoryTextures={CATEGORY_TEXTURES} />
    </group>
  );
}
