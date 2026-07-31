import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  DEPLOYMENT_PROJECTION_GROUPS,
  deploymentProjectionInputFiles,
} from "./mysql-schema.mjs";
import { normalizeExportDate } from "./projection-transfer-date.mjs";

const FINGERPRINT_FORMAT_VERSION = 1;
const MARIADB_COMPATIBILITY_VERSION = "11.8";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function migrationFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await migrationFiles(path));
    if (entry.isFile()) files.push(path);
  }
  return files;
}

async function fileFingerprint(repositoryRoot, path) {
  const content = await readFile(join(repositoryRoot, path));
  return { path, sha256: sha256(content) };
}

export async function projectionFingerprints({
  exportId,
  repositoryRoot = root,
} = {}) {
  const normalizedExportId = normalizeExportDate(exportId);
  if (!normalizedExportId) throw new Error("exportId must be a valid timestamp");
  const resultMigrations = (await migrationFiles(join(repositoryRoot, "migrations", "mysql", "results")))
    .map((path) => relative(repositoryRoot, path))
    .sort();
  const groups = {};

  for (const group of DEPLOYMENT_PROJECTION_GROUPS) {
    const inputs = [...new Set([
      ...deploymentProjectionInputFiles(group.name),
      ...resultMigrations,
    ])].sort();
    const files = [];
    for (const path of inputs) files.push(await fileFingerprint(repositoryRoot, path));
    const payload = {
      fingerprintFormatVersion: FINGERPRINT_FORMAT_VERSION,
      group: group.name,
      groupFingerprintVersion: group.fingerprintVersion,
      exportId: normalizedExportId,
      mariaDbCompatibilityVersion: MARIADB_COMPATIBILITY_VERSION,
      files,
    };
    const digest = sha256(`${JSON.stringify(payload)}\n`);
    groups[group.name] = {
      fingerprint: `projection-transfer-${group.name}-v${group.fingerprintVersion}-${digest}`,
      digest,
      inputs,
    };
  }

  return {
    version: FINGERPRINT_FORMAT_VERSION,
    exportId: normalizedExportId,
    mariaDbCompatibilityVersion: MARIADB_COMPATIBILITY_VERSION,
    groups,
  };
}

function activeFingerprint(state, groupName) {
  if (typeof state?.fingerprints?.[groupName] === "string") {
    return state.fingerprints[groupName];
  }
  const canonical = state?.groups?.[groupName];
  if (typeof canonical === "string") return canonical;
  if (canonical && typeof canonical.fingerprint === "string") return canonical.fingerprint;
  return null;
}

export async function projectionReleasePlan({
  exportId,
  productionExportId,
  productionState = {},
  selectedGroups,
  repositoryRoot = root,
} = {}) {
  const fingerprints = await projectionFingerprints({ exportId, repositoryRoot });
  const normalizedExportId = normalizeExportDate(exportId);
  const normalizedProductionExportId = productionExportId
    ? normalizeExportDate(productionExportId)
    : null;
  const requested = selectedGroups?.length
    ? new Set(selectedGroups)
    : new Set(DEPLOYMENT_PROJECTION_GROUPS.map(({ name }) => name));
  const unknown = [...requested].filter((name) => !fingerprints.groups[name]);
  if (unknown.length > 0) {
    throw new Error(`Unknown deployment projection group: ${unknown.join(", ")}`);
  }
  const exportChanged = Boolean(
    productionExportId
      && (normalizedExportId === null
        || normalizedProductionExportId === null
        || normalizedProductionExportId !== normalizedExportId),
  );
  // Raw WCA tables are shared by every projection group. A new raw export must
  // therefore publish a complete generation even when a caller requested a
  // subset, or production would contain projections from two different exports.
  const selected = exportChanged
    ? new Set(DEPLOYMENT_PROJECTION_GROUPS.map(({ name }) => name))
    : requested;
  const requiredGroups = [...selected].filter((name) =>
    activeFingerprint(productionState, name) !== fingerprints.groups[name].fingerprint);
  return {
    ...fingerprints,
    productionExportId: productionExportId || null,
    exportChanged,
    expandedToAllGroups: exportChanged && requested.size !== selected.size,
    required: requiredGroups.length > 0,
    requiredGroups,
    requiredGroupsCsv: requiredGroups.join(","),
  };
}

function argumentValue(name) {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : "";
}

async function cli() {
  const exportId = argumentValue("export-id");
  const productionExportId = argumentValue("production-export-id");
  const statePath = argumentValue("state-file");
  const groups = argumentValue("groups").split(",").map((name) => name.trim()).filter(Boolean);
  const productionState = statePath
    ? JSON.parse(await readFile(statePath, "utf8"))
    : {};
  const plan = await projectionReleasePlan({
    exportId,
    productionExportId,
    productionState,
    selectedGroups: groups.length > 0 ? groups : undefined,
  });
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await cli();
}
