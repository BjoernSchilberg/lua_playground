"use client";

import * as THREE from "three";

const MAT_MAIN = new THREE.MeshLambertMaterial({ color: "lightgray" });
const MAT_EDGE = new THREE.MeshLambertMaterial({ color: "darkgray" });

interface Rock3DProps {
  position?: [number, number, number];
}

export default function Rock3D({ position = [0, 0, 0] }: Rock3DProps) {
  return (
    <group position={position}>
      <mesh position={[0, 0.25, 0]} castShadow material={MAT_MAIN}>
        <boxGeometry args={[0.6, 0.35, 0.5]} />
      </mesh>
      <mesh position={[0.05, 0.45, -0.02]} castShadow material={MAT_EDGE}>
        <boxGeometry args={[0.35, 0.12, 0.28]} />
      </mesh>
    </group>
  );
}
