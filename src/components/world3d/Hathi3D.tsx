"use client";

import { useRef, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/* ------------------------------------------------------------------ */
/*  Direction → Y-axis rotation (radians)                             */
/*  0=N (+Z→−Z), 1=E (+X), 2=S (−Z→+Z), 3=W (−X)                   */
/* ------------------------------------------------------------------ */

const DIR_ROTATION = [0, -Math.PI / 2, Math.PI, Math.PI / 2];

/* ------------------------------------------------------------------ */
/*  SVG-matched color palette                                         */
/*  hathi_0.svg: #84b5fd (top/highlight), #6495ed (face/front/ears),  */
/*               #5485dd (side), #3465bd (legs dark)                  */
/* ------------------------------------------------------------------ */

const COL_TOP   = "#84b5fd"; // lightest — body top
const COL_FRONT = "#6495ed"; // face / front / ears
const COL_SIDE  = "#5485dd"; // body sides
const COL_DARK  = "#3465bd"; // legs & shadow

const MAT_FRONT = new THREE.MeshLambertMaterial({ color: COL_FRONT });
const MAT_SIDE  = new THREE.MeshLambertMaterial({ color: COL_SIDE });
const MAT_DARK  = new THREE.MeshLambertMaterial({ color: COL_DARK });
const MAT_EAR   = new THREE.MeshLambertMaterial({ color: COL_FRONT });
const MAT_TRUNK = new THREE.MeshLambertMaterial({ color: COL_SIDE });
const MAT_TAIL  = new THREE.MeshLambertMaterial({ color: COL_SIDE });
const MAT_EYE_WHITE = new THREE.MeshLambertMaterial({ color: "white" });
const MAT_EYE_BLACK = new THREE.MeshLambertMaterial({ color: "#111" });

/* Per-face body materials: +x, -x, +y, -y, +z, -z */
function makeBodyMaterials() {
  const top    = new THREE.MeshLambertMaterial({ color: COL_TOP });
  const bottom = new THREE.MeshLambertMaterial({ color: COL_SIDE });
  const front  = new THREE.MeshLambertMaterial({ color: COL_FRONT }); // -z
  const back   = new THREE.MeshLambertMaterial({ color: COL_SIDE });  // +z
  const right  = new THREE.MeshLambertMaterial({ color: COL_SIDE });  // +x
  const left   = new THREE.MeshLambertMaterial({ color: COL_SIDE });  // -x
  return [right, left, top, bottom, back, front];
}

function makeHeadMaterials() {
  const top    = new THREE.MeshLambertMaterial({ color: COL_TOP });
  const bottom = new THREE.MeshLambertMaterial({ color: COL_FRONT });
  const front  = new THREE.MeshLambertMaterial({ color: COL_FRONT }); // -z
  const back   = new THREE.MeshLambertMaterial({ color: COL_SIDE });  // +z
  const right  = new THREE.MeshLambertMaterial({ color: COL_SIDE });  // +x
  const left   = new THREE.MeshLambertMaterial({ color: COL_SIDE });  // -x
  return [right, left, top, bottom, back, front];
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

interface Hathi3DProps {
  row: number;
  col: number;
  dir: number;
  centerX: number;
  centerZ: number;
  speed: number;
}

export default function Hathi3D({ row, col, dir, centerX, centerZ, speed }: Hathi3DProps) {
  const groupRef = useRef<THREE.Group>(null!);

  const bodyMats = useMemo(makeBodyMaterials, []);
  const headMats = useMemo(makeHeadMaterials, []);

  /* Animation state */
  const anim = useRef({
    fromX: col - centerX,
    fromZ: row - centerZ,
    toX: col - centerX,
    toZ: row - centerZ,
    fromRot: DIR_ROTATION[dir] ?? 0,
    toRot: DIR_ROTATION[dir] ?? 0,
    t: 1, // 0..1, 1 = done
    duration: 0.15,
  });

  /* Watch for position/direction changes */
  const prevRef = useRef({ row, col, dir });

  useEffect(() => {
    const prev = prevRef.current;
    const a = anim.current;

    const targetX = col - centerX;
    const targetZ = row - centerZ;
    const targetRot = DIR_ROTATION[dir] ?? 0;

    const posChanged = prev.row !== row || prev.col !== col;
    const dirChanged = prev.dir !== dir;

    if (posChanged || dirChanged) {
      // Snap if teleporting (>1 tile)
      const dr = Math.abs(row - prev.row);
      const dc = Math.abs(col - prev.col);
      if (dr > 1 || dc > 1 || dr + dc > 1) {
        a.fromX = targetX;
        a.fromZ = targetZ;
        a.fromRot = targetRot;
        a.toX = targetX;
        a.toZ = targetZ;
        a.toRot = targetRot;
        a.t = 1;
      } else {
        // Start smooth animation from current interpolated position
        const p = a.t < 1 ? a.t : 1;
        a.fromX = a.fromX + (a.toX - a.fromX) * p;
        a.fromZ = a.fromZ + (a.toZ - a.fromZ) * p;
        a.fromRot = a.toRot; // snap rotation to previous target
        a.toX = targetX;
        a.toZ = targetZ;
        a.toRot = targetRot;
        a.t = 0;
        a.duration = Math.max(0.02, 0.15 / speed);
      }
    }

    prevRef.current = { row, col, dir };
  }, [row, col, dir, centerX, centerZ, speed]);

  /* Animate every frame */
  useFrame((_, delta) => {
    const a = anim.current;
    if (a.t < 1) {
      a.t = Math.min(1, a.t + delta / a.duration);
      const ease = 1 - (1 - a.t) * (1 - a.t); // ease-out quad
      const x = a.fromX + (a.toX - a.fromX) * ease;
      const z = a.fromZ + (a.toZ - a.fromZ) * ease;
      groupRef.current.position.set(x, 0, z);

      // Shortest-path rotation interpolation
      let dRot = a.toRot - a.fromRot;
      if (dRot > Math.PI) dRot -= Math.PI * 2;
      if (dRot < -Math.PI) dRot += Math.PI * 2;
      groupRef.current.rotation.y = a.fromRot + dRot * ease;
    }
  });

  /* Initial position */
  const initX = col - centerX;
  const initZ = row - centerZ;
  const initRot = DIR_ROTATION[dir] ?? 0;

  return (
    <group ref={groupRef} position={[initX, 0, initZ]} rotation={[0, initRot, 0]} scale={[1.75, 1.75, 1.75]}>
      {/* Body — isometric block with per-face colors */}
      <mesh position={[0, 0.34, 0]} castShadow material={bodyMats}>
        <boxGeometry args={[0.42, 0.3, 0.55]} />
      </mesh>

      {/* Head — slightly smaller block in front with per-face colors */}
      <mesh position={[0, 0.42, -0.34]} castShadow material={headMats}>
        <boxGeometry args={[0.34, 0.26, 0.2]} />
      </mesh>

      {/* Eyes — white with black pupils */}
      <mesh position={[0.1, 0.46, -0.445]} material={MAT_EYE_WHITE}>
        <boxGeometry args={[0.07, 0.07, 0.01]} />
      </mesh>
      <mesh position={[-0.1, 0.46, -0.445]} material={MAT_EYE_WHITE}>
        <boxGeometry args={[0.07, 0.07, 0.01]} />
      </mesh>
      <mesh position={[0.1, 0.46, -0.452]} material={MAT_EYE_BLACK}>
        <boxGeometry args={[0.04, 0.04, 0.01]} />
      </mesh>
      <mesh position={[-0.1, 0.46, -0.452]} material={MAT_EYE_BLACK}>
        <boxGeometry args={[0.04, 0.04, 0.01]} />
      </mesh>

      {/* Trunk — two small boxes hanging from head */}
      <mesh position={[0, 0.32, -0.47]} castShadow material={MAT_TRUNK}>
        <boxGeometry args={[0.1, 0.12, 0.08]} />
      </mesh>
      <mesh position={[0, 0.23, -0.47]} castShadow material={MAT_TRUNK}>
        <boxGeometry args={[0.08, 0.08, 0.06]} />
      </mesh>

      {/* Ears — flat plates on each side of the head */}
      <mesh position={[0.23, 0.42, -0.3]} castShadow material={MAT_EAR}>
        <boxGeometry args={[0.05, 0.2, 0.14]} />
      </mesh>
      <mesh position={[-0.23, 0.42, -0.3]} castShadow material={MAT_EAR}>
        <boxGeometry args={[0.05, 0.2, 0.14]} />
      </mesh>

      {/* Front legs — dark blue */}
      <mesh position={[0.12, 0.1, -0.18]} castShadow material={MAT_DARK}>
        <boxGeometry args={[0.1, 0.2, 0.1]} />
      </mesh>
      <mesh position={[-0.12, 0.1, -0.18]} castShadow material={MAT_DARK}>
        <boxGeometry args={[0.1, 0.2, 0.1]} />
      </mesh>

      {/* Back legs — dark blue */}
      <mesh position={[0.12, 0.1, 0.18]} castShadow material={MAT_DARK}>
        <boxGeometry args={[0.1, 0.2, 0.1]} />
      </mesh>
      <mesh position={[-0.12, 0.1, 0.18]} castShadow material={MAT_DARK}>
        <boxGeometry args={[0.1, 0.2, 0.1]} />
      </mesh>

      {/* Tail — thin piece at the back */}
      <mesh position={[0, 0.38, 0.3]} castShadow material={MAT_TAIL}>
        <boxGeometry args={[0.04, 0.1, 0.04]} />
      </mesh>
    </group>
  );
}
