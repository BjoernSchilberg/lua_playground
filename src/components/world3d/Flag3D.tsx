"use client";

import * as THREE from "three";

const MAT_TAN = new THREE.MeshLambertMaterial({ color: "tan" });
const MAT_SIENNA = new THREE.MeshLambertMaterial({ color: "sienna" });
const MAT_WHITE = new THREE.MeshLambertMaterial({ color: "white" });

interface Flag3DProps {
  position?: [number, number, number];
}

export default function Flag3D({ position = [0, 0, 0] }: Flag3DProps) {
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
      {/* Small white cloth — drooping */}
      <mesh position={[0.12, 0.3, 0]} castShadow material={MAT_WHITE}>
        <boxGeometry args={[0.16, 0.22, 0.03]} />
      </mesh>
    </group>
  );
}
