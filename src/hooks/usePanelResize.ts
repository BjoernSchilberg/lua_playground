import { useState, useRef, useCallback } from "react";

export function usePanelResize() {
  const [editorWidthPct, setEditorWidthPct] = useState(70);
  const [consolePct, setConsolePct] = useState(30);
  const leftColRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const startHDrag = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const isTouch = "touches" in e;
    const startX = isTouch ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const startPct = editorWidthPct;
    const container = containerRef.current;
    if (!container) return;
    const totalW = container.getBoundingClientRect().width;

    const getX = (ev: MouseEvent | TouchEvent) =>
      "touches" in ev ? ev.touches[0].clientX : (ev as MouseEvent).clientX;

    const onMove = (ev: MouseEvent | TouchEvent) => {
      const delta = getX(ev) - startX;
      const newPct = startPct + (delta / totalW) * 100;
      setEditorWidthPct(Math.min(Math.max(newPct, 20), 90));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onUp);
  }, [editorWidthPct]);

  const startVDrag = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const isTouch = "touches" in e;
    const startY = isTouch ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    const startPct = consolePct;
    const leftCol = leftColRef.current;
    if (!leftCol) return;
    const totalH = leftCol.getBoundingClientRect().height;

    const getY = (ev: MouseEvent | TouchEvent) =>
      "touches" in ev ? ev.touches[0].clientY : (ev as MouseEvent).clientY;

    const onMove = (ev: MouseEvent | TouchEvent) => {
      const delta = startY - getY(ev);
      const newPct = startPct + (delta / totalH) * 100;
      setConsolePct(Math.min(Math.max(newPct, 10), 70));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onUp);
  }, [consolePct]);

  return {
    editorWidthPct,
    consolePct,
    leftColRef,
    containerRef,
    startHDrag,
    startVDrag,
  };
}
