import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  DEPLOYMENT_PROJECTION_GROUPS,
  MARIADB_COMPATIBILITY_VERSION,
  PROJECTION_ARTIFACT_FORMAT_VERSION,
  downstreamGroupClosure,
  projectionGroup,
} from "./projection-groups.mjs";
import { normalizeExportDate } from "./projection-transfer-date.mjs";

const SEMANTIC_FINGERPRINT_FORMAT_VERSION = 3;
const ARTIFACT_FINGERPRINT_FORMAT_VERSION = 3;
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

function requestedGroups(selectedGroups) {
  const requested = selectedGroups?.length
    ? new Set(selectedGroups)
    : new Set(DEPLOYMENT_PROJECTION_GROUPS.map(({ name }) => name));
  const unknown = [...requested].filter((name) =>
    !DEPLOYMENT_PROJECTION_GROUPS.some((group) => group.name === name));
  if (unknown.length > 0) {
    throw new Error(`Unknown deployment projection group: ${unknown.join(", ")}`);
  }
  return requested;
}

export async function semanticProjectionFingerprints({ repositoryRoot = root } = {}) {
  const resultMigrations = (await migrationFiles(join(repositoryRoot, "migrations", "mysql", "results")))
    .map((path) => relative(repositoryRoot, path))
    .sort();
  const groups = {};

  for (const group of DEPLOYMENT_PROJECTION_GROUPS) {
    const inputs = [...new Set([
      ...group.sqlFiles.map((file) => `sql/ranking-projections/${file}`),
      ...resultMigrations,
    ])].sort();
    const files = await Promise.all(inputs.map((path) => fileFingerprint(repositoryRoot, path)));
    const payload = {
      semanticFingerprintFormatVersion: SEMANTIC_FINGERPRINT_FORMAT_VERSION,
      group: group.name,
      groupSchemaVersion: group.schemaVersion,
      groupDefinition: {
        dependencies: group.dependencies,
        projectionNames: group.projectionNames,
        tables: group.tables,
        sqlFiles: group.sqlFiles,
      },
      files,
    };
    const digest = sha256(`${JSON.stringify(payload)}\n`);
    groups[group.name] = {
      semanticFingerprint: `projection-semantic-${group.name}-v${group.schemaVersion}-${digest}`,
      semanticDigest: digest,
      inputs,
    };
  }

  return { version: SEMANTIC_FINGERPRINT_FORMAT_VERSION, groups };
}

function activeSemanticFingerprint(state, groupName) {
  return state?.semanticFingerprints?.[groupName]
    ?? state?.groups?.[groupName]?.semanticFingerprint
    ?? null;
}

function activeArtifactFingerprint(state, groupName) {
  return state?.artifactFingerprints?.[groupName]
    ?? state?.groups?.[groupName]?.artifactFingerprint
    ?? null;
}

export async function projectionSemanticPlan({
  productionState = {},
  selectedGroups,
  forceRebuild = false,
  repositoryRoot = root,
} = {}) {
  const semantics = await semanticProjectionFingerprints({ repositoryRoot });
  const requested = requestedGroups(selectedGroups);
  const changedRoots = forceRebuild
    ? [...requested]
    : [...requested].filter((name) =>
      activeSemanticFingerprint(productionState, name)
        !== semantics.groups[name].semanticFingerprint);
  const changedGroups = downstreamGroupClosure(changedRoots).map(({ name }) => name);
  return {
    ...semantics,
    required: changedGroups.length > 0,
    changedRoots,
    changedGroups,
    changedGroupsCsv: changedGroups.join(","),
  };
}

export async function projectionFingerprints({
  exportId,
  repositoryRoot = root,
  semanticFingerprints,
} = {}) {
  const normalizedExportId = normalizeExportDate(exportId);
  if (!normalizedExportId) throw new Error("exportId must be a valid timestamp");
  const semantics = semanticFingerprints
    ?? await semanticProjectionFingerprints({ repositoryRoot });
  const groups = {};

  function create(groupName) {
    if (groups[groupName]) return groups[groupName];
    const group = projectionGroup(groupName);
    const dependencies = Object.fromEntries(group.dependencies.map((dependency) => [
      dependency,
      create(dependency).artifactFingerprint,
    ]));
    const semantic = semantics.groups[groupName];
    if (!semantic?.semanticFingerprint) {
      throw new Error(`Missing semantic fingerprint for ${groupName}`);
    }
    const payload = {
      artifactFingerprintFormatVersion: ARTIFACT_FINGERPRINT_FORMAT_VERSION,
      group: groupName,
      semanticFingerprint: semantic.semanticFingerprint,
      exportId: normalizedExportId,
      mariaDbCompatibilityVersion: MARIADB_COMPATIBILITY_VERSION,
      artifactFormatVersion: PROJECTION_ARTIFACT_FORMAT_VERSION,
      dependencies,
    };
    const digest = sha256(`${JSON.stringify(payload)}\n`);
    groups[groupName] = {
      ...semantic,
      artifactFingerprint: `projection-artifact-${groupName}-v${ARTIFACT_FINGERPRINT_FORMAT_VERSION}-${digest}`,
      artifactDigest: digest,
      dependencies,
    };
    return groups[groupName];
  }

  for (const group of DEPLOYMENT_PROJECTION_GROUPS) create(group.name);
  return {
    version: ARTIFACT_FINGERPRINT_FORMAT_VERSION,
    semanticVersion: semantics.version,
    exportId: normalizedExportId,
    mariaDbCompatibilityVersion: MARIADB_COMPATIBILITY_VERSION,
    artifactFormatVersion: PROJECTION_ARTIFACT_FORMAT_VERSION,
    groups,
  };
}

function availableArtifact(availableArtifacts, groupName, desired) {
  const artifact = availableArtifacts?.[groupName];
  if (!artifact || artifact.valid === false) return null;
  const fingerprint = artifact.artifactFingerprint ?? artifact.fingerprint;
  if (fingerprint !== desired.artifactFingerprint) return null;
  return artifact;
}

export async function projectionReleasePlan({
  exportId,
  productionExportId,
  productionState = {},
  selectedGroups,
  availableArtifacts = {},
  forceRebuild = false,
  repositoryRoot = root,
} = {}) {
  const semanticPlan = await projectionSemanticPlan({
    productionState,
    selectedGroups,
    forceRebuild,
    repositoryRoot,
  });
  const fingerprints = await projectionFingerprints({
    exportId,
    repositoryRoot,
    semanticFingerprints: semanticPlan,
  });
  const normalizedExportId = normalizeExportDate(exportId);
  const normalizedProductionExportId = productionExportId
    ? normalizeExportDate(productionExportId)
    : null;
  const exportChanged = !normalizedProductionExportId
    || normalizedProductionExportId !== normalizedExportId;
  const selected = exportChanged || forceRebuild
    ? DEPLOYMENT_PROJECTION_GROUPS.map(({ name }) => name)
    : semanticPlan.changedGroups;

  const activeGroups = [];
  const cachedGroups = [];
  const buildGroups = [];
  for (const name of selected) {
    const desired = fingerprints.groups[name];
    if (!exportChanged && !forceRebuild
      && activeArtifactFingerprint(productionState, name) === desired.artifactFingerprint) {
      activeGroups.push(name);
    } else if (availableArtifact(availableArtifacts, name, desired)) {
      cachedGroups.push(name);
    } else {
      buildGroups.push(name);
    }
  }

  const hydrateGroups = new Set();
  const builds = new Set(buildGroups);
  function satisfyDependencies(groupName) {
    for (const dependency of projectionGroup(groupName).dependencies) {
      if (builds.has(dependency)) {
        satisfyDependencies(dependency);
        continue;
      }
      const desired = fingerprints.groups[dependency];
      if (availableArtifact(availableArtifacts, dependency, desired)) {
        hydrateGroups.add(dependency);
      } else {
        builds.add(dependency);
        satisfyDependencies(dependency);
      }
    }
  }
  for (const group of [...builds]) satisfyDependencies(group);

  const orderedBuildGroups = DEPLOYMENT_PROJECTION_GROUPS
    .filter(({ name }) => builds.has(name))
    .map(({ name }) => name);
  const orderedHydrateGroups = DEPLOYMENT_PROJECTION_GROUPS
    .filter(({ name }) => hydrateGroups.has(name) && !builds.has(name))
    .map(({ name }) => name);
  const releaseGroups = selected.filter((name) => !activeGroups.includes(name));

  return {
    ...fingerprints,
    productionExportId: productionExportId || null,
    exportChanged,
    semanticChangeRequired: semanticPlan.required,
    changedGroups: semanticPlan.changedGroups,
    required: releaseGroups.length > 0,
    selectedGroups: selected,
    activeGroups,
    cachedGroups,
    buildGroups: orderedBuildGroups,
    hydrateGroups: orderedHydrateGroups,
    releaseGroups,
    requiredGroups: releaseGroups,
    requiredGroupsCsv: releaseGroups.join(","),
    buildGroupsCsv: orderedBuildGroups.join(","),
    hydrateGroupsCsv: orderedHydrateGroups.join(","),
  };
}

function argumentValue(name) {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : "";
}

async function readJsonFile(path, fallback = {}) {
  return path ? JSON.parse(await readFile(path, "utf8")) : fallback;
}

async function cli() {
  const command = process.argv[2] === "semantic" ? "semantic" : "release";
  const statePath = argumentValue("state-file");
  const groups = argumentValue("groups").split(",").map((name) => name.trim()).filter(Boolean);
  const productionState = await readJsonFile(statePath);
  if (command === "semantic") {
    const plan = await projectionSemanticPlan({
      productionState,
      selectedGroups: groups.length > 0 ? groups : undefined,
      forceRebuild: argumentValue("force-rebuild") === "true",
    });
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }
  const plan = await projectionReleasePlan({
    exportId: argumentValue("export-id"),
    productionExportId: argumentValue("production-export-id"),
    productionState,
    availableArtifacts: await readJsonFile(argumentValue("available-artifacts-file")),
    selectedGroups: groups.length > 0 ? groups : undefined,
    forceRebuild: argumentValue("force-rebuild") === "true",
  });
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await cli();
}
