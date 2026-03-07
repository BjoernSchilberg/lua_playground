"use client";

import * as THREE from "three";

const MAT_BODY = new THREE.MeshLambertMaterial({ color: "#CB241A" });
const MAT_STEM = new THREE.MeshLambertMaterial({ color: "#2a5a18" });

interface Tomato3DProps {
  position?: [number, number, number];
}

export default function Tomato3D({ position = [0, 0, 0] }: Tomato3DProps) {
  return (
    <group position={position}>
      <mesh position={[0, 0.2, 0]} castShadow material={MAT_BODY}>
        <boxGeometry args={[0.24, 0.2, 0.24]} />
      </mesh>
      <mesh position={[0, 0.33, 0]} castShadow material={MAT_STEM}>
        <boxGeometry args={[0.05, 0.06, 0.05]} />
      </mesh>
    </group>
  );
}
