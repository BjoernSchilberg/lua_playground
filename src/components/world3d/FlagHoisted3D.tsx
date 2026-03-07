"use client";

import * as THREE from "three";

const MAT_TAN = new THREE.MeshLambertMaterial({ color: "tan" });
const MAT_SIENNA = new THREE.MeshLambertMaterial({ color: "sienna" });
const MAT_WHITE = new THREE.MeshLambertMaterial({ color: "white" });

interface FlagHoisted3DProps {
  position?: [number, number, number];
}

export default function FlagHoisted3D({ position = [0, 0, 0] }: FlagHoisted3DProps) {
  return (
    <group position={position}>
      {/* Shadow pole */}
      <mesh position={[0.02, 0.5, 0]} castShadow material={MAT_SIENNA}>
        <boxGeometry args={[0.08, 0.88, 0.08]} />
      </mesh>
      {/* Main pole */}
      <mesh position={[0, 0.5, 0]} castShadow material={MAT_TAN}>
        <boxGeometry args={[0.07, 0.88, 0.07]} />
      </mesh>
      {/* Large white flag at top */}
      <mesh position={[0.24, 0.82, 0]} castShadow material={MAT_WHITE}>
        <boxGeometry args={[0.4, 0.22, 0.03]} />
      </mesh>
    </group>
  );
}
