import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const SERVER_COMPONENT_PATHS = {
  app: [
    "Dockerfile", "docker-entrypoint.sh", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml",
    "app", "components", "lib", "db", "public", "next.config.*", "tsconfig.json",
    "vite.config.ts", "vite-env.d.ts", "postcss.config.mjs", ".dockerignore",
    "release-compatibility.json",
  ],
  flyway: ["Dockerfile.flyway", "migrations/mysql"],
  dataTools: [
    "Dockerfile.data-tools", "scripts", "sql", "migrations/mysql",
    "release-compatibility.json", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml",
  ],
};

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function componentFingerprint(paths, { repositoryRoot = process.cwd() } = {}) {
  const files = execFileSync("git", ["ls-files", "-z", "--", ...paths], {
    cwd: repositoryRoot,
  }).toString().split("\0").filter(Boolean).sort();
  const checksums = files.map((file) =>
    `${sha256(readFileSync(new URL(file, pathToFileURL(`${repositoryRoot}/`))))}  ${file}\n`,
  ).join("");
  return sha256(checksums);
}

export function serverComponentFingerprints(options) {
  return {
    app: componentFingerprint(SERVER_COMPONENT_PATHS.app, options),
    flyway: componentFingerprint(SERVER_COMPONENT_PATHS.flyway, options),
    dataTools: componentFingerprint(SERVER_COMPONENT_PATHS.dataTools, options),
  };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.stdout.write(`${JSON.stringify(serverComponentFingerprints())}\n`);
}
