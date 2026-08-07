import type { ComponentPropsWithoutRef } from "react";
import "./Checkbox.css";

export function Checkbox({ className = "", ...props }: Omit<ComponentPropsWithoutRef<"input">, "type">) {
  return <input {...props} type="checkbox" data-control="checkbox" className={`Checkbox ${className}`.trim()} />;
}
