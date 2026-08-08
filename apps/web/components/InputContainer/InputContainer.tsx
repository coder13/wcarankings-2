import type { CSSProperties, ReactNode } from "react";

export function InputContainer({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`InputContainer${className ? ` ${className}` : ""}`}>
      {children}
    </div>
  );
}

export function InputContainerItem({
  children,
  className = "",
  width,
}: {
  children: ReactNode;
  className?: string;
  width?: string;
}) {
  const style: CSSProperties | undefined = width
    ? { width, flex: `0 0 ${width}` }
    : undefined;

  return (
    <div
      className={`InputContainer-item${className ? ` ${className}` : ""}`}
      style={style}
    >
      {children}
    </div>
  );
}
