"use client";

import { useMemo } from "react";
import * as THREE from "three";

/* ------------------------------------------------------------------ */
/*  World objects — colors matched to SVG sprites                      */
/* ------------------------------------------------------------------ */

interface WorldObjectProps {
  code: string;
  x: number;
  z: number;
}

/* Materials derived from SVG fill/stroke colors */
const MAT = {
  /* rock.svg: fill=lightgray stroke=darkgray */
  rockMain: new THREE.MeshLambertMaterial({ color: "lightgray" }),
  rockEdge: new THREE.MeshLambertMaterial({ color: "darkgray" }),

  /* tree.svg: trunk fill=sienna stroke=saddlebrown, canopy fill=forestgreen stroke=darkgreen */
  trunk: new THREE.MeshLambertMaterial({ color: "sienna" }),
  trunkDark: new THREE.MeshLambertMaterial({ color: "saddlebrown" }),
  leaves: new THREE.MeshLambertMaterial({ color: "forestgreen" }),
  leavesDark: new THREE.MeshLambertMaterial({ color: "darkgreen" }),

  /* bananas.svg: fill=#ffc701, stem=#884a13 */
  banana: new THREE.MeshLambertMaterial({ color: "#ffc701" }),
  bananaStem: new THREE.MeshLambertMaterial({ color: "#884a13" }),

  /* crate.svg: fill=tan stroke=sienna */
  crate: new THREE.MeshLambertMaterial({ color: "tan" }),
  crateStripe: new THREE.MeshLambertMaterial({ color: "sienna" }),

  /* flag.svg: pole tan/sienna, cloth white/black */
  poleTan: new THREE.MeshLambertMaterial({ color: "tan" }),
  poleSienna: new THREE.MeshLambertMaterial({ color: "sienna" }),
  clothWhite: new THREE.MeshLambertMaterial({ color: "white" }),
  clothOutline: new THREE.MeshLambertMaterial({ color: "#333" }),

  /* squash.svg: fill=palegoldenrod stroke=darkkhaki */
  squash: new THREE.MeshLambertMaterial({ color: "palegoldenrod" }),
  squashEdge: new THREE.MeshLambertMaterial({ color: "darkkhaki" }),

  /* tomato.svg: fill=#CB241A, highlights=#E41F16 */
  tomato: new THREE.MeshLambertMaterial({ color: "#CB241A" }),
  tomatoStem: new THREE.MeshLambertMaterial({ color: "#2a5a18" }),
};

export default function WorldObject({ code, x, z }: WorldObjectProps) {
  const content = useMemo(() => {
    switch (code) {
      /* ---- Rock: isometric cube (lightgray/darkgray) ---- */
      case "r":
        return (
          <group position={[x, 0, z]}>
            <mesh position={[0, 0.25, 0]} castShadow material={MAT.rockMain}>
              <boxGeometry args={[0.6, 0.35, 0.5]} />
            </mesh>
            <mesh position={[0.05, 0.45, -0.02]} castShadow material={MAT.rockEdge}>
              <boxGeometry args={[0.35, 0.12, 0.28]} />
            </mesh>
          </group>
        );

      /* ---- Tree: sienna trunk + forestgreen canopy cube ---- */
      case "t":
        return (
          <group position={[x, 0, z]}>
            {/* Trunk — small isometric cube matching tree.svg */}
            <mesh position={[0, 0.24, 0]} castShadow material={MAT.trunk}>
              <boxGeometry args={[0.2, 0.35, 0.2]} />
            </mesh>
            {/* Canopy — large isometric cube */}
            <mesh position={[0, 0.6, 0]} castShadow material={MAT.leaves}>
              <boxGeometry args={[0.65, 0.5, 0.65]} />
            </mesh>
          </group>
        );

      /* ---- Bananas: golden yellow blocks + brown stem ---- */
      case "b":
        return (
          <group position={[x, 0, z]}>
            {/* Stem/post */}
            <mesh position={[0, 0.22, 0]} castShadow material={MAT.bananaStem}>
              <boxGeometry args={[0.06, 0.3, 0.06]} />
            </mesh>
            {/* Banana bunch */}
            <mesh position={[0, 0.14, 0]} castShadow material={MAT.banana}>
              <boxGeometry args={[0.28, 0.14, 0.22]} />
            </mesh>
          </group>
        );

      /* ---- Crate: tan cube with sienna ribbon ---- */
      case "c":
        return (
          <group position={[x, 0, z]}>
            <mesh position={[0, 0.28, 0]} castShadow material={MAT.crate}>
              <boxGeometry args={[0.45, 0.42, 0.45]} />
            </mesh>
            {/* Ribbon/band on top — sienna cross */}
            <mesh position={[0, 0.495, 0]} material={MAT.crateStripe}>
              <boxGeometry args={[0.46, 0.015, 0.12]} />
            </mesh>
            <mesh position={[0, 0.495, 0]} material={MAT.crateStripe}>
              <boxGeometry args={[0.12, 0.015, 0.46]} />
            </mesh>
            {/* Vertical side bands */}
            <mesh position={[0, 0.28, 0.226]} material={MAT.crateStripe}>
              <boxGeometry args={[0.1, 0.42, 0.01]} />
            </mesh>
            <mesh position={[0.226, 0.28, 0]} material={MAT.crateStripe}>
              <boxGeometry args={[0.01, 0.42, 0.1]} />
            </mesh>
          </group>
        );

      /* ---- Flag (lowered): tan/sienna pole + white cloth ---- */
      case "F":
        return (
          <group position={[x, 0, z]}>
            {/* Shadow pole */}
            <mesh position={[0.02, 0.5, 0]} castShadow material={MAT.poleSienna}>
              <boxGeometry args={[0.08, 0.88, 0.08]} />
            </mesh>
            {/* Main pole */}
            <mesh position={[0, 0.5, 0]} castShadow material={MAT.poleTan}>
              <boxGeometry args={[0.07, 0.88, 0.07]} />
            </mesh>
            {/* Small white cloth — drooping */}
            <mesh position={[0.12, 0.3, 0]} castShadow material={MAT.clothWhite}>
              <boxGeometry args={[0.16, 0.22, 0.03]} />
            </mesh>
          </group>
        );

      /* ---- Flag (hoisted): pole + large waving white flag ---- */
      case "G":
        return (
          <group position={[x, 0, z]}>
            {/* Shadow pole */}
            <mesh position={[0.02, 0.5, 0]} castShadow material={MAT.poleSienna}>
              <boxGeometry args={[0.08, 0.88, 0.08]} />
            </mesh>
            {/* Main pole */}
            <mesh position={[0, 0.5, 0]} castShadow material={MAT.poleTan}>
              <boxGeometry args={[0.07, 0.88, 0.07]} />
            </mesh>
            {/* Large white flag at top */}
            <mesh position={[0.24, 0.82, 0]} castShadow material={MAT.clothWhite}>
              <boxGeometry args={[0.4, 0.22, 0.03]} />
            </mesh>
          </group>
        );

      /* ---- Squash: palegoldenrod body + darkkhaki accent ---- */
      case "s":
        return (
          <group position={[x, 0, z]}>
            <mesh position={[0, 0.2, 0]} castShadow material={MAT.squash}>
              <boxGeometry args={[0.3, 0.2, 0.25]} />
            </mesh>
            <mesh position={[0, 0.33, 0]} castShadow material={MAT.squashEdge}>
              <boxGeometry args={[0.06, 0.08, 0.06]} />
            </mesh>
          </group>
        );

      /* ---- Tomato: red body + green stem ---- */
      case "o":
        return (
          <group position={[x, 0, z]}>
            <mesh position={[0, 0.2, 0]} castShadow material={MAT.tomato}>
              <boxGeometry args={[0.24, 0.2, 0.24]} />
            </mesh>
            <mesh position={[0, 0.33, 0]} castShadow material={MAT.tomatoStem}>
              <boxGeometry args={[0.05, 0.06, 0.05]} />
            </mesh>
          </group>
        );

      default:
        return null;
    }
  }, [code, x, z]);

  return content;
}
