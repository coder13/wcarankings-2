"use client";

import { useEffect, useRef, useState } from "react";

export function useRailScrollProgress({
  enabled,
  revealDistance,
  transformDistance,
}: {
  enabled: boolean;
  revealDistance: number;
  transformDistance: number;
}) {
  const [topProgress, setTopProgress] = useState(0);
  const [bottomProgress, setBottomProgress] = useState(0);
  const topRef = useRef(0);
  const bottomRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const update = () => {
      const raw = Math.max(0, Math.min(1, window.scrollY / transformDistance));
      const nextTop = raw * raw * (3 - 2 * raw);
      if (nextTop !== topRef.current) {
        topRef.current = nextTop;
        setTopProgress(nextTop);
      }
      const distanceToEnd = Math.max(0, document.documentElement.scrollHeight - (window.scrollY + window.innerHeight));
      const nextBottom = Math.max(0, Math.min(1, distanceToEnd / revealDistance));
      if (nextBottom !== bottomRef.current) {
        bottomRef.current = nextBottom;
        setBottomProgress(nextBottom);
      }
    };
    const frame = window.requestAnimationFrame(update);
    window.addEventListener("scroll", update, { passive: true });
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("scroll", update); };
  }, [enabled, revealDistance, transformDistance]);

  return { topProgress, bottomProgress };
}
