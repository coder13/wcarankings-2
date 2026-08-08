import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type {
  ComponentFingerprintOptions,
  RepositoryPath,
  ServerComponentFingerprints,
} from "../server-component-types.ts";

const SERVER_COMPONENT_PATHS = {
  app: [
    "Dockerfile",
    "docker-entrypoint.sh",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "apps/web/package.json",
    "apps/web/app",
    "apps/web/components",
    "apps/web/controllers",
    "apps/web/lib",
    "apps/web/db",
    "apps/web/services",
    "apps/web/translations",
    "apps/web/public",
    "apps/web/next.config.*",
    "apps/web/tsconfig.json",
    "apps/web/vite.config.ts",
    "apps/web/vite-env.d.ts",
    "apps/web/postcss.config.mjs",
    ".dockerignore",
    "release-compatibility.json",
  ],
  flyway: ["docker/Dockerfile.flyway", "migrations/mysql"],
  dataTools: [
    "docker/Dockerfile.data-tools",
    "data-tools",
    "scripts",
    "sql",
    "migrations/mysql",
    "release-compatibility.json",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
  ],
};

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function componentFingerprint(
  paths: readonly RepositoryPath[],
  options: ComponentFingerprintOptions = {},
): string {
  const { repositoryRoot = process.cwd() } = options;
  const files = execFileSync("git", ["ls-files", "-z", "--", ...paths], {
    cwd: repositoryRoot,
  })
    .toString()
    .split("\0")
    .filter(Boolean)
    .filter((file) =>
      existsSync(new URL(file, pathToFileURL(`${repositoryRoot}/`))),
    )
    .sort();
  const checksums = files
    .map(
      (file) =>
        `${sha256(readFileSync(new URL(file, pathToFileURL(`${repositoryRoot}/`))))}  ${file}\n`,
    )
    .join("");
  return sha256(checksums);
}

export function serverComponentFingerprints(
  options: ComponentFingerprintOptions = {},
): ServerComponentFingerprints {
  return {
    app: componentFingerprint(SERVER_COMPONENT_PATHS.app, options),
    flyway: componentFingerprint(SERVER_COMPONENT_PATHS.flyway, options),
    dataTools: componentFingerprint(SERVER_COMPONENT_PATHS.dataTools, options),
  };
}
