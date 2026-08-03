"use client";

import { useEffect, useRef, useState } from "react";

export function getTopRailScrollProgress(
  scrollY: number,
  transformDistance: number,
) {
  if (!Number.isFinite(scrollY) || !Number.isFinite(transformDistance) || transformDistance <= 0) {
    return 0;
  }

  const raw = Math.max(0, Math.min(1, scrollY / transformDistance));
  return raw * raw * (3 - 2 * raw);
}

export function useTopRailScrollProgress(transformDistance: number) {
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);

  useEffect(() => {
    const update = () => {
      const next = getTopRailScrollProgress(window.scrollY, transformDistance);
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
