import vinext from "vinext";
import { defineConfig } from "vite";
import svgr from "vite-plugin-svgr";

const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const isStorybook = process.env.STORYBOOK === "true";
const allowedHosts = process.env.VITE_ALLOWED_HOSTS?.split(",")
  .map((host) => host.trim())
  .filter(Boolean);

export default defineConfig({
  assetsInclude: ["**/*.woff2"],
  build: {
    ssrManifest: true,
  },
  server:
    isCodexSeatbeltSandbox || allowedHosts?.length
      ? {
          ...(isCodexSeatbeltSandbox
            ? { watch: { useFsEvents: false, usePolling: true } }
            : {}),
          ...(allowedHosts?.length ? { allowedHosts } : {}),
        }
      : undefined,
  ssr: {
    external: ["mysql2"],
  },
  plugins: isStorybook ? [] : [svgr(), vinext()],
});
