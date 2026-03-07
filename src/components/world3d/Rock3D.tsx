"use client";

import * as THREE from "three";

const MAT_MAIN = new THREE.MeshLambertMaterial({ color: "lightgray" });
const MAT_EDGE = new THREE.MeshLambertMaterial({ color: "darkgray" });

interface Rock3DProps {
  position?: [number, number, number];
}

export default function Rock3D({ position = [0, 0, 0] }: Rock3DProps) {
  return (
    <group position={position} scale={[0.75, 0.75, 0.75]}>
      <mesh position={[0, 0.5, 0]} castShadow material={MAT_MAIN} >
        <boxGeometry args={[0.75, 0.75, 0.75]} />
      </mesh>
    </group>
  );
}
