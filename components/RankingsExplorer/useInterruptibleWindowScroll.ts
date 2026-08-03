"use client";

import { animate, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const SCROLLING_KEYS = new Set([
  "ArrowDown",
  "ArrowUp",
  "End",
  "Home",
  "PageDown",
  "PageUp",
  " ",
]);

type ScrollAnimationRequest = {
  from: number;
  to: number;
  prepare?: () => void;
};

export function useInterruptibleWindowScroll({
  duration,
  ease,
}: {
  duration: number;
  ease: readonly [number, number, number, number];
}) {
  const shouldReduceMotion = useReducedMotion();
  const animationRef = useRef<ReturnType<typeof animate> | null>(null);
  const generationRef = useRef(0);
  const [active, setActive] = useState(false);

  const cancel = useCallback(() => {
    generationRef.current += 1;
    animationRef.current?.stop();
    animationRef.current = null;
    setActive(false);
  }, []);
  const isActive = useCallback(() => animationRef.current !== null, []);
  const start = useCallback(
    ({ from, to, prepare }: ScrollAnimationRequest) => {
      cancel();

      if (shouldReduceMotion || from === to) {
        prepare?.();
        window.scrollTo({ top: to, behavior: "auto" });
        return;
      }

      const generation = generationRef.current;
      const animation = animate(from, to, {
        autoplay: false,
        duration,
        ease,
        onUpdate: (offset) => {
          window.scrollTo({ top: offset, behavior: "auto" });
        },
        onComplete: () => {
          if (generation !== generationRef.current) return;
          animationRef.current = null;
          setActive(false);
        },
      });
      animationRef.current = animation;
      setActive(true);

      try {
        prepare?.();
        window.scrollTo({ top: from, behavior: "auto" });
        animation.play();
      } catch (error) {
        cancel();
        throw error;
      }
    },
    [cancel, duration, ease, shouldReduceMotion],
  );

  useEffect(() => {
    const cancelForKey = (event: KeyboardEvent) => {
      if (SCROLLING_KEYS.has(event.key)) cancel();
    };

    window.addEventListener("keydown", cancelForKey);
    window.addEventListener("pointerdown", cancel);
    window.addEventListener("touchstart", cancel, { passive: true });
    window.addEventListener("wheel", cancel, { passive: true });

    return () => {
      cancel();
      window.removeEventListener("keydown", cancelForKey);
      window.removeEventListener("pointerdown", cancel);
      window.removeEventListener("touchstart", cancel);
      window.removeEventListener("wheel", cancel);
    };
  }, [cancel]);

  return useMemo(
    () => ({ start, cancel, isActive, active }),
    [active, cancel, isActive, start],
  );
}
