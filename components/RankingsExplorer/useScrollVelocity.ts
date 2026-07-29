"use client";

import { useEffect, useRef } from "react";

export function useScrollVelocity() {
  const velocityRef = useRef({ top: 0, timestamp: 0, downwardPixelsPerMs: 0 });

  useEffect(() => {
    const update = () => {
      const now = performance.now();
      const previous = velocityRef.current;
      const elapsed = now - previous.timestamp;
      const distance = window.scrollY - previous.top;
      velocityRef.current = {
        top: window.scrollY,
        timestamp: now,
        downwardPixelsPerMs: elapsed > 0 && distance > 0 ? distance / elapsed : 0,
      };
    };
    velocityRef.current = { top: window.scrollY, timestamp: performance.now(), downwardPixelsPerMs: 0 };
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return velocityRef;
}
