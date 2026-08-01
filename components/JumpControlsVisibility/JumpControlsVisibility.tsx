import type { ReactElement } from "react";

export function JumpControlsVisibility({
  visible,
  progress,
  fallback,
  children,
}: {
  visible?: boolean;
  progress?: number;
  fallback?: ReactElement;
  children: ReactElement;
}) {
  const isVisible = visible ?? (progress ?? 0) > 0;

  return (
    <>
      <div
        className="JumpControlsVisibility"
        data-visible={isVisible}
        aria-hidden={!isVisible}
        inert={!isVisible}
      >
        {children}
      </div>
      {fallback && (
        <div
          className="JumpControlsFallback"
          data-visible={!isVisible}
          aria-hidden={isVisible}
        >
          {fallback}
        </div>
      )}
    </>
  );
}
