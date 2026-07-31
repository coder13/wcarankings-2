import type { CSSProperties, ReactElement } from "react";

export function JumpControlsVisibility({
  visible,
  progress,
  bottomOffset = 0,
  children,
}: {
  visible?: boolean;
  progress?: number;
  bottomOffset?: number;
  children: ReactElement;
}) {
  const resolvedProgress = Math.max(
    0,
    Math.min(1, progress ?? (visible ? 1 : 0))
  );
  const isVisible = resolvedProgress > 0;
  const isInteractive = resolvedProgress >= 0.99;

  return (
    <div
      className="JumpControlsVisibility"
      data-visible={isVisible}
      data-interactive={isInteractive}
      aria-hidden={!isInteractive}
      inert={!isInteractive}
      style={
        {
          "--jump-controls-progress": resolvedProgress,
          "--jump-controls-bottom-offset": `${bottomOffset}px`,
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}
