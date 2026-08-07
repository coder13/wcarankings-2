"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function Dropdown({
  open,
  onOpenChange,
  className = "",
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
  children: ReactNode;
}) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (dropdownRef.current?.contains(event.target as Node)) return;
      onOpenChange(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [onOpenChange, open]);

  return (
    <div className={`Dropdown${className ? ` ${className}` : ""}`} ref={dropdownRef}>
      {children}
    </div>
  );
}
