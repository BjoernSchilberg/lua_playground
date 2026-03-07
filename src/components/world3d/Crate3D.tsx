"use client";

import * as THREE from "three";

const MAT_CRATE = new THREE.MeshLambertMaterial({ color: "tan" });
const MAT_STRIPE = new THREE.MeshLambertMaterial({ color: "sienna" });

interface Crate3DProps {
  position?: [number, number, number];
}

export default function Crate3D({ position = [0, 0, 0] }: Crate3DProps) {
  return (
    <group position={position}>
      <mesh position={[0, 0.28, 0]} castShadow material={MAT_CRATE}>
        <boxGeometry args={[0.45, 0.42, 0.45]} />
      </mesh>
      {/* Ribbon/band on top — sienna cross */}
      <mesh position={[0, 0.495, 0]} material={MAT_STRIPE}>
        <boxGeometry args={[0.46, 0.015, 0.12]} />
      </mesh>
      <mesh position={[0, 0.495, 0]} material={MAT_STRIPE}>
        <boxGeometry args={[0.12, 0.015, 0.46]} />
      </mesh>
      {/* Vertical side bands */}
      <mesh position={[0, 0.28, 0.226]} material={MAT_STRIPE}>
        <boxGeometry args={[0.1, 0.42, 0.01]} />
      </mesh>
      <mesh position={[0.226, 0.28, 0]} material={MAT_STRIPE}>
        <boxGeometry args={[0.01, 0.42, 0.1]} />
      </mesh>
    </group>
  );
}
