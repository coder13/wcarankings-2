export async function load(url, context, nextLoad) {
  if (url.endsWith(".css")) {
    return {
      format: "module",
      shortCircuit: true,
      source: "export default {};",
    };
  }

  if (url.endsWith(".svg?react")) {
    return {
      format: "module",
      shortCircuit: true,
      source: `
        import { createElement } from "react";
        export default function SvgIcon(props) {
          return createElement("svg", { ...props, "aria-hidden": "true" });
        }
      `,
    };
  }

  return nextLoad(url, context);
}
