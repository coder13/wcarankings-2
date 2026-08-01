"use client";

import { useEffect, useRef, useState } from "react";

export function useTopRailScrollProgress(transformDistance: number) {
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);

  useEffect(() => {
    const update = () => {
      const raw = Math.max(0, Math.min(1, window.scrollY / transformDistance));
      const next = raw * raw * (3 - 2 * raw);
      if (next === progressRef.current) return;
      progressRef.current = next;
      setProgress(next);
    };
    const frame = window.requestAnimationFrame(update);
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
    };
  }, [transformDistance]);

  return progress;
}

export function useHasScrolled() {
  const [hasScrolled, setHasScrolled] = useState(false);

  useEffect(() => {
    const update = () => setHasScrolled((current) => {
      const next = window.scrollY > 1;
      return next === current ? current : next;
    });
    const frame = window.requestAnimationFrame(update);
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
    };
  }, []);

  return hasScrolled;
}
