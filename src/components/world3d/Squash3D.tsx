"use client";

import * as THREE from "three";

const MAT_BODY = new THREE.MeshLambertMaterial({ color: "palegoldenrod" });
const MAT_STEM = new THREE.MeshLambertMaterial({ color: "darkkhaki" });

interface Squash3DProps {
  position?: [number, number, number];
}

export default function Squash3D({ position = [0, 0, 0] }: Squash3DProps) {
  return (
    <group position={position}>
      <mesh position={[0, 0.2, 0]} castShadow material={MAT_BODY}>
        <boxGeometry args={[0.3, 0.2, 0.25]} />
      </mesh>
      <mesh position={[0, 0.33, 0]} castShadow material={MAT_STEM}>
        <boxGeometry args={[0.06, 0.08, 0.06]} />
      </mesh>
    </group>
  );
}
