import vinext from "vinext";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import svgr from "vite-plugin-svgr";

const envDir = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, envDir, ""));
  const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
  const isStorybook = process.env.STORYBOOK === "true";
  const allowedHosts = process.env.VITE_ALLOWED_HOSTS?.split(",")
    .map((host) => host.trim())
    .filter(Boolean);

  return {
    assetsInclude: ["**/*.woff2"],
    envDir,
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
      external: ["bullmq", "mysql2"],
    },
    plugins: isStorybook ? [] : [svgr(), vinext()],
  };
});
