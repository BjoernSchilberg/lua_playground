"use client";

import { useEffect, useState, useMemo } from "react";

const COLORS = ["#f44336", "#e91e63", "#9c27b0", "#673ab7", "#3f51b5",
  "#2196f3", "#00bcd4", "#4caf50", "#8bc34a", "#ffeb3b",
  "#ff9800", "#ff5722", "#e040fb", "#00e676", "#ffd740"];
const PARTICLE_COUNT = 60;
const DURATION = 3000; // ms

interface Particle {
  x: number;   // % from left
  delay: number; // s
  dur: number;   // s
  size: number;  // px
  color: string;
  drift: number; // px horizontal wobble
  rot: number;   // deg final rotation
}

export default function Confetti({ active }: { active: boolean }) {
  const [visible, setVisible] = useState(false);

  const particles = useMemo<Particle[]>(() =>
    Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * 100,
      delay: Math.random() * 0.6,
      dur: 1.8 + Math.random() * 1.4,
      size: 5 + Math.random() * 6,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      drift: (Math.random() - 0.5) * 120,
      rot: Math.random() * 720 - 360,
    })),
  []);

  useEffect(() => {
    if (active) {
      setVisible(true);
      const t = setTimeout(() => setVisible(false), DURATION);
      return () => clearTimeout(t);
    }
  }, [active]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 50,
      }}
      aria-hidden
    >
      {particles.map((p, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: `${p.x}%`,
            top: -12,
            width: p.size,
            height: p.size * 0.6,
            backgroundColor: p.color,
            borderRadius: 1,
            opacity: 1,
            animation: `confetti-fall ${p.dur}s ${p.delay}s ease-in forwards`,
            "--drift": `${p.drift}px`,
            "--rot": `${p.rot}deg`,
          } as React.CSSProperties}
        />
      ))}
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translateY(0) translateX(0) rotate(0deg); opacity: 1; }
          80%  { opacity: 1; }
          100% { transform: translateY(calc(100vh + 20px)) translateX(var(--drift)) rotate(var(--rot)); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
