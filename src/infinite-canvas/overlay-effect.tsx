import { useFrame } from "@react-three/fiber";
import * as React from "react";
import * as THREE from "three";
import type { PlaneOverlay } from "~/src/copilot/effects-store";

const PARTICLE_COUNT_MULTIPLIER = 200;

const PARTICLE_SIZES: Record<string, number> = {
  sparkles: 0.6,
  stars: 0.9,
  dust: 0.3,
};

function generateParticles(count: number, w: number, h: number): Float32Array {
  const positions = new Float32Array(count * 3);
  const margin = Math.max(w, h) * 0.15;
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    positions[i3] = (Math.random() - 0.5) * (w + margin * 2);
    positions[i3 + 1] = (Math.random() - 0.5) * (h + margin * 2);
    positions[i3 + 2] = (Math.random() - 0.5) * 2;
  }
  return positions;
}

export function OverlayEffect({
  overlay,
  width,
  height,
  opacityRef,
}: {
  overlay: PlaneOverlay;
  width: number;
  height: number;
  opacityRef: React.RefObject<{ opacity: number }>;
}) {
  const pointsRef = React.useRef<THREE.Points>(null);
  const timeRef = React.useRef(0);

  const count = Math.floor(overlay.density * PARTICLE_COUNT_MULTIPLIER);
  const basePositions = React.useMemo(() => generateParticles(count, width, height), [count, width, height]);

  const geometry = React.useMemo(() => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(basePositions.slice(), 3));
    return geom;
  }, [basePositions]);

  const material = React.useMemo(
    () =>
      new THREE.PointsMaterial({
        color: overlay.color,
        size: PARTICLE_SIZES[overlay.type] ?? 0.6,
        transparent: true,
        depthWrite: false,
        sizeAttenuation: true,
        blending: THREE.AdditiveBlending,
      }),
    [overlay.color, overlay.type],
  );

  useFrame((_state, delta) => {
    const pts = pointsRef.current;
    if (!pts) return;

    timeRef.current += delta;
    const t = timeRef.current;

    const posAttr = pts.geometry.attributes.position;
    if (!posAttr) return;
    const arr = posAttr.array as Float32Array;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const speed = 0.5 + (i % 7) * 0.05;
      arr[i3 + 1] = basePositions[i3 + 1] + Math.sin(t * speed + i) * 0.8;
      arr[i3] = basePositions[i3] + Math.cos(t * speed * 0.7 + i * 0.5) * 0.5;
    }
    posAttr.needsUpdate = true;

    (pts.material as THREE.PointsMaterial).opacity = opacityRef.current.opacity;
  });

  React.useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  return <points ref={pointsRef} geometry={geometry} material={material} />;
}
