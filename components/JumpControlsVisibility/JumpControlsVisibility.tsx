import { motion, useMotionValue, useMotionValueEvent, type MotionValue } from "motion/react";
import { useEffect, useState, type CSSProperties, type ReactElement } from "react";

export function JumpControlsVisibility({
  visible,
  progress,
  progressValue,
  bottomOffset = 0,
  children,
}: {
  visible?: boolean;
  progress?: number;
  progressValue?: MotionValue<number>;
  bottomOffset?: number;
  children: ReactElement;
}) {
  const resolvedProgress = Math.max(
    0,
    Math.min(1, progress ?? (visible ? 1 : 0))
  );
  const fallbackProgress = useMotionValue(resolvedProgress);
  const activeProgress = progressValue ?? fallbackProgress;
  const [isVisible, setIsVisible] = useState(() => activeProgress.get() > 0);
  const [isInteractive, setIsInteractive] = useState(() => activeProgress.get() >= 0.99);

  useEffect(() => fallbackProgress.set(resolvedProgress), [fallbackProgress, resolvedProgress]);
  useMotionValueEvent(activeProgress, "change", (nextProgress) => {
    setIsVisible((current) => current === nextProgress > 0 ? current : nextProgress > 0);
    setIsInteractive((current) => current === nextProgress >= 0.99 ? current : nextProgress >= 0.99);
  });

  return (
    <motion.div
      className="JumpControlsVisibility"
      data-visible={isVisible}
      data-interactive={isInteractive}
      aria-hidden={!isInteractive}
      inert={!isInteractive}
      style={
        {
          "--jump-controls-progress": activeProgress,
          "--jump-controls-bottom-offset": `${bottomOffset}px`,
        } as CSSProperties
      }
    >
      {children}
    </motion.div>
  );
}
