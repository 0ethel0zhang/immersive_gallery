import { useFrame } from "@react-three/fiber";
import * as React from "react";
import * as THREE from "three";
import type { FrameStyle, PlaneFrame } from "~/src/copilot/effects-store";


/** Push a quad (2 triangles) into the vertex/index arrays. */
function pushQuad(verts: number[], indices: number[], x0: number, y0: number, x1: number, y1: number, z: number) {
  const base = verts.length / 3;
  verts.push(x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z);
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function buildFrameBorderGeometry(w: number, h: number, thickness: number, style: FrameStyle): THREE.BufferGeometry {
  const hw = w / 2;
  const hh = h / 2;
  const verts: number[] = [];
  const indices: number[] = [];
  // Small inset so frame inner edges overlap the artwork, eliminating the seam
  const inset = thickness * 0.08;

  // Outer border — 4 strips that overlap the artwork edge by `inset`
  // Bottom strip
  pushQuad(verts, indices, -hw - thickness, -hh - thickness, hw + thickness, -hh + inset, 0);
  // Top strip
  pushQuad(verts, indices, -hw - thickness, hh - inset, hw + thickness, hh + thickness, 0);
  // Left strip
  pushQuad(verts, indices, -hw - thickness, -hh + inset, -hw + inset, hh - inset, 0);
  // Right strip
  pushQuad(verts, indices, hw - inset, -hh + inset, hw + thickness, hh - inset, 0);

  if (style === "double") {
    // Second inner border with a gap
    const gap = thickness * 0.5;
    const t2 = thickness * 0.6;
    const inX = hw + thickness + gap;
    const inY = hh + thickness + gap;
    // Bottom
    pushQuad(verts, indices, -inX - t2, -inY - t2, inX + t2, -inY, 0.01);
    // Top
    pushQuad(verts, indices, -inX - t2, inY, inX + t2, inY + t2, 0.01);
    // Left
    pushQuad(verts, indices, -inX - t2, -inY, -inX, inY, 0.01);
    // Right
    pushQuad(verts, indices, inX, -inY, inX + t2, inY, 0.01);
  }

  if (style === "ornate") {
    // Decorative corner squares
    const cs = thickness * 1.8; // corner square size
    const corners = [
      [-hw - thickness, hh], // top-left
      [hw, hh], // top-right
      [-hw - thickness, -hh - thickness], // bottom-left
      [hw, -hh - thickness], // bottom-right
    ] as const;
    for (const [cx, cy] of corners) {
      pushQuad(verts, indices, cx - cs * 0.3, cy - cs * 0.3, cx + cs, cy + cs, 0.01);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geom.setIndex(indices);
  return geom;
}

export function FrameDecoration({
  frame,
  width,
  height,
  opacityRef,
}: {
  frame: PlaneFrame;
  width: number;
  height: number;
  opacityRef: React.RefObject<{ opacity: number }>;
}) {
  const meshRef = React.useRef<THREE.Mesh>(null);

  // Scale thickness relative to artwork size so frames are visible at all zoom levels
  const baseThickness = Math.max(width, height) * 0.03; // 3% of artwork size
  const thickness = baseThickness + frame.width * 0.5;

  const geometry = React.useMemo(
    () => buildFrameBorderGeometry(width, height, thickness, frame.style),
    [width, height, thickness, frame.style],
  );

  const material = React.useMemo(
    () => new THREE.MeshBasicMaterial({ color: frame.color, transparent: true, side: THREE.DoubleSide, fog: false }),
    [frame.color],
  );

  React.useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  useFrame(() => {
    if (meshRef.current) {
      const op = opacityRef.current.opacity;
      (meshRef.current.material as THREE.MeshBasicMaterial).opacity = op;
      meshRef.current.visible = op > 0.01;
    }
  });

  return <mesh ref={meshRef} geometry={geometry} material={material} position={[0, 0, 0.1]} />;
}
