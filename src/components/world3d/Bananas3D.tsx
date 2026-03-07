"use client";

import { useGLTF } from "@react-three/drei";
import basePath from "@/lib/basePath";

interface Bananas3DProps {
  position?: [number, number, number];
}

export default function Bananas3D({ position = [0, 0, 0] }: Bananas3DProps) {
  const { scene } = useGLTF(`${basePath}/models/banana.glb`);

  return (
    <group position={position}>
      <primitive object={scene.clone()} position={[0, 0.125, 0]} scale={[0.75, 0.75, 0.75]} castShadow />
    </group>
  );
}
