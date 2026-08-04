import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { argumentValue } from "../../lib/arguments.ts";
import { projectionGroup } from "../../../data-tools/projections/jobs.ts";
import { normalizeExportDate } from "../../../data-tools/shared/date.ts";
import { verifyProjectionReleaseCoordinate } from "../release/projection-release-coordinate.ts";

type DeploymentInput = {
  artifactId: string;
  artifactName: string;
  artifactRunId: string;
  dataToolsImage: string;
  expectedManifestSha256: string;
  expectedSourceSha: string;
  flywayImage: string;
  groups: string[];
  productionExportValue: string;
  repository: string;
  wcaExportDate: string;
  wcaExportValue: string;
};

type ArtifactMetadata = {
  expired?: boolean;
  name?: string;
  workflow_run?: { id?: number };
};

type DeploymentPlan = {
  hasRaw: boolean;
  normalizedBuildExport: string;
  normalizedProductionExport: string;
};

function matches(value: string, pattern: RegExp, name: string) {
  if (!pattern.test(value)) throw new Error(`${name} is invalid`);
  return value;
}

function projectionGroups(value: string) {
  const groups = value.split(",").filter(Boolean);
  if (groups.length === 0) throw new Error("PROJECTION_GROUPS is required");
  for (const group of groups) projectionGroup(group);
  return groups;
}

function exportIdentity(value: string, name: string) {
  const normalized = normalizeExportDate(value);
  if (!normalized) throw new Error(`${name} is invalid`);
  return normalized;
}

export function deploymentInput(
  environment: NodeJS.ProcessEnv = process.env,
): DeploymentInput {
  const required = (name: string): string => {
    const value = environment[name];
    if (!value) throw new Error(`${name} is required`);
    return value;
  };
  const groups = projectionGroups(required("PROJECTION_GROUPS"));
  return {
    artifactId: matches(required("ARTIFACT_ID"), /^[0-9]+$/, "ARTIFACT_ID"),
    artifactName: required("ARTIFACT_NAME"),
    artifactRunId: matches(
      required("ARTIFACT_RUN_ID"),
      /^[0-9]+$/,
      "ARTIFACT_RUN_ID",
    ),
    dataToolsImage: matches(
      required("DATA_TOOLS_IMAGE"),
      /^ghcr\.io\/.+@sha256:[0-9a-f]{64}$/,
      "DATA_TOOLS_IMAGE",
    ),
    expectedManifestSha256: matches(
      required("EXPECTED_MANIFEST_SHA256"),
      /^[0-9a-f]{64}$/,
      "EXPECTED_MANIFEST_SHA256",
    ),
    expectedSourceSha: matches(
      required("EXPECTED_SOURCE_SHA"),
      /^[0-9a-f]{40}$/,
      "EXPECTED_SOURCE_SHA",
    ),
    flywayImage: matches(
      required("FLYWAY_IMAGE"),
      /^ghcr\.io\/.+@sha256:[0-9a-f]{64}$/,
      "FLYWAY_IMAGE",
    ),
    groups,
    productionExportValue: exportIdentity(
      required("PRODUCTION_WCA_EXPORT_VALUE"),
      "PRODUCTION_WCA_EXPORT_VALUE",
    ),
    repository: required("GITHUB_REPOSITORY"),
    wcaExportDate: matches(
      required("WCA_EXPORT_DATE"),
      /^\d{4}-\d{2}-\d{2}$/,
      "WCA_EXPORT_DATE",
    ),
    wcaExportValue: exportIdentity(
      required("WCA_EXPORT_VALUE"),
      "WCA_EXPORT_VALUE",
    ),
  };
}

export function validateArtifactMetadata(
  metadata: ArtifactMetadata,
  input: DeploymentInput,
) {
  if (
    metadata?.name !== input.artifactName ||
    metadata?.workflow_run?.id !== Number(input.artifactRunId) ||
    metadata?.expired !== false
  ) {
    throw new Error(
      "GitHub artifact metadata does not match the release coordinate",
    );
  }
}

export function validateRawRequirement(plan: DeploymentPlan) {
  if (
    plan.normalizedBuildExport !== plan.normalizedProductionExport &&
    !plan.hasRaw
  ) {
    throw new Error(
      "The projection artifact must include the raw export when the build and production exports differ",
    );
  }
}

export async function planProjectionDeployment({
  directory,
  environment = process.env,
  fetchArtifact = async (input: DeploymentInput): Promise<ArtifactMetadata> => {
    const token = environment.GH_TOKEN;
    if (!token) throw new Error("GH_TOKEN is required");
    const response = await fetch(
      `https://api.github.com/repos/${input.repository}/actions/artifacts/${input.artifactId}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "wcarankings-projection-deployment",
        },
      },
    );
    if (!response.ok) {
      throw new Error(
        `GitHub artifact lookup failed with status ${response.status}`,
      );
    }
    return (await response.json()) as ArtifactMetadata;
  },
}: {
  directory: string;
  environment?: NodeJS.ProcessEnv;
  fetchArtifact?: (input: DeploymentInput) => Promise<ArtifactMetadata>;
}): Promise<DeploymentPlan> {
  const input = deploymentInput(environment);
  const metadata = await fetchArtifact(input);
  validateArtifactMetadata(metadata, input);
  const verified = await verifyProjectionReleaseCoordinate({
    directory,
    expectedSha256: input.expectedManifestSha256,
    expectedGroups: input.groups,
    expectedExportId: environment.WCA_EXPORT_VALUE,
    expectedSourceSha: input.expectedSourceSha,
  });
  const compatibility = JSON.parse(
    await readFile(resolve("release-compatibility.json"), "utf8"),
  ) as {
    artifactFormatVersion: number;
    datasetSchemaVersion: number;
  };
  if (
    verified.manifest.compatibility?.artifactFormatVersion !==
      compatibility.artifactFormatVersion ||
    verified.manifest.compatibility?.datasetSchemaVersion !==
      compatibility.datasetSchemaVersion
  ) {
    throw new Error(
      "Projection artifact compatibility does not match the deployed server contract",
    );
  }
  const plan = {
    hasRaw: verified.manifest.raw !== null,
    normalizedBuildExport: input.wcaExportValue,
    normalizedProductionExport: input.productionExportValue,
  };
  validateRawRequirement(plan);
  return plan;
}

async function cli() {
  const directory = resolve(argumentValue("directory") || ".");
  const plan = await planProjectionDeployment({ directory });
  process.stdout.write(`${JSON.stringify(plan)}\n`);
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  await cli();
}
