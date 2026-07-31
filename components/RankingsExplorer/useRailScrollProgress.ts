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
  const [atTop, setAtTop] = useState(true);
  const [topCompact, setTopCompact] = useState(false);
  const [bottomProgress, setBottomProgress] = useState(0);
  const atTopRef = useRef(true);
  const topCompactRef = useRef(false);
  const bottomRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const update = () => {
      const nextAtTop = window.scrollY === 0;
      if (nextAtTop !== atTopRef.current) {
        atTopRef.current = nextAtTop;
        setAtTop(nextAtTop);
      }
      const nextTopCompact = window.scrollY >= transformDistance;
      if (nextTopCompact !== topCompactRef.current) {
        topCompactRef.current = nextTopCompact;
        setTopCompact(nextTopCompact);
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

  return { atTop, topCompact, bottomProgress };
}
