import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vinext from "vinext";
import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const nodeModulesRoot = realpathSync(resolve(projectRoot, "node_modules"));
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const isStorybook = process.env.STORYBOOK === "true";

export default defineConfig({
  assetsInclude: ["**/*.woff2"],
  build: {
    ssrManifest: true,
  },
  server: {
    fs: { allow: [projectRoot, nodeModulesRoot] },
    ...(isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : {}),
  },
  ssr: {
    external: ["mysql2"],
  },
  plugins: isStorybook ? [] : [svgr(), vinext()],
});
