"use client";

import * as THREE from "three";

const MAT_STEM = new THREE.MeshLambertMaterial({ color: "#884a13" });
const MAT_BANANA = new THREE.MeshLambertMaterial({ color: "#ffc701" });

interface Bananas3DProps {
  position?: [number, number, number];
}

export default function Bananas3D({ position = [0, 0, 0] }: Bananas3DProps) {
  return (
    <group position={position}>
      {/* Stem/post */}
      <mesh position={[0, 0.22, 0]} castShadow material={MAT_STEM}>
        <boxGeometry args={[0.06, 0.3, 0.06]} />
      </mesh>
      {/* Banana bunch */}
      <mesh position={[0, 0.14, 0]} castShadow material={MAT_BANANA}>
        <boxGeometry args={[0.28, 0.14, 0.22]} />
      </mesh>
    </group>
  );
}
