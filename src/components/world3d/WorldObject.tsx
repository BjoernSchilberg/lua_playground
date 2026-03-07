"use client";

import { useMemo } from "react";
import Rock3D from "./Rock3D";
import Tree3D from "./Tree3D";
import Bananas3D from "./Bananas3D";
import Crate3D from "./Crate3D";
import Flag3D from "./Flag3D";
import FlagHoisted3D from "./FlagHoisted3D";
import Squash3D from "./Squash3D";
import Tomato3D from "./Tomato3D";

/* ------------------------------------------------------------------ */
/*  World objects — each type is a separate Triplex-editable component */
/* ------------------------------------------------------------------ */

interface WorldObjectProps {
  code: string;
  x: number;
  z: number;
}

export default function WorldObject({ code, x, z }: WorldObjectProps) {
  const content = useMemo(() => {
    switch (code) {
      case "r":
        return <Rock3D position={[x, 0, z]} />;
      case "t":
        return <Tree3D position={[x, 0, z]} />;
      case "b":
        return <Bananas3D position={[x, 0, z]} />;
      case "c":
        return <Crate3D position={[x, 0, z]} />;
      case "F":
        return <Flag3D position={[x, 0, z]} />;
      case "G":
        return <FlagHoisted3D position={[x, 0, z]} />;
      case "s":
        return <Squash3D position={[x, 0, z]} />;
      case "o":
        return <Tomato3D position={[x, 0, z]} />;
      default:
        return null;
    }
  }, [code, x, z]);

  return content;
}
