"use client";

import * as THREE from "three";

const MAT_TRUNK = new THREE.MeshLambertMaterial({ color: "sienna" });
const MAT_LEAVES = new THREE.MeshLambertMaterial({ color: "forestgreen" });

interface Tree3DProps {
  position?: [number, number, number];
}

export default function Tree3D({ position = [0, 0, 0] }: Tree3DProps) {
  return (
    <group position={position} scale={[1.3, 1.3, 1.3]}>
      {/* Trunk — small isometric cube matching tree.svg */}
      <mesh position={[0, 0.24, 0]} castShadow material={MAT_TRUNK}>
        <boxGeometry args={[0.2, 0.35, 0.2]} />
      </mesh>
      {/* Canopy — large isometric cube */}
      <mesh position={[0, 0.6, 0]} castShadow material={MAT_LEAVES}>
        <boxGeometry args={[0.65, 0.5, 0.65]} />
      </mesh>
    </group>
  );
}
