import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/nextjs-vite";
import svgr from "vite-plugin-svgr";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const config: StorybookConfig = {
  stories: ["../components/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: [],
  framework: {
    name: "@storybook/nextjs-vite",
    options: {},
  },
  docs: {
    autodocs: "tag",
  },
  viteFinal(config) {
    config.plugins = [...(config.plugins ?? []), svgr()];
    config.server ??= {};
    config.server.fs = {
      ...config.server.fs,
      allow: [
        ...(config.server.fs?.allow ?? []),
        projectRoot,
        realpathSync(resolve(projectRoot, "node_modules")),
      ],
    };
    return config;
  },
};

export default config;
