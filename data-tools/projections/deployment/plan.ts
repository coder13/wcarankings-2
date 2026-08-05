import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { projectionGroup } from "../../projection-catalog/groups.ts";
import { normalizeExportDate } from "../../shared/date.ts";
import { verifyProjectionReleaseCoordinate } from "../artifacts/coordinate.ts";
import type {
  FetchArtifactMetadata,
  GitHubArtifactMetadata,
  PlanProjectionDeploymentOptions,
  ProjectionDeploymentInput,
  ProjectionDeploymentPlan,
} from "./types.ts";

interface ReleaseCompatibility {
  artifactFormatVersion: number;
  datasetSchemaVersion: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function matches(value: string, pattern: RegExp, name: string): string {
  if (!pattern.test(value)) throw new Error(`${name} is invalid`);
  return value;
}

function projectionGroups(value: string): string[] {
  const groups = value.split(",").filter(Boolean);
  if (groups.length === 0) throw new Error("PROJECTION_GROUPS is required");
  for (const group of groups) projectionGroup(group);
  return groups;
}

function exportIdentity(value: string, name: string): string {
  const normalized = normalizeExportDate(value);
  if (!normalized) throw new Error(`${name} is invalid`);
  return normalized;
}

export function deploymentInput(
  environment: NodeJS.ProcessEnv = process.env,
): ProjectionDeploymentInput {
  function required(name: string): string {
    const value = environment[name];
    if (!value) throw new Error(`${name} is required`);
    return value;
  }

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
    groups: projectionGroups(required("PROJECTION_GROUPS")),
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
  metadata: GitHubArtifactMetadata,
  input: ProjectionDeploymentInput,
): void {
  if (
    metadata.name !== input.artifactName ||
    metadata.workflow_run?.id !== Number(input.artifactRunId) ||
    metadata.expired !== false
  ) {
    throw new Error(
      "GitHub artifact metadata does not match the release coordinate",
    );
  }
}

export function validateRawRequirement(plan: ProjectionDeploymentPlan): void {
  if (
    plan.normalizedBuildExport !== plan.normalizedProductionExport &&
    !plan.hasRaw
  ) {
    throw new Error(
      "The projection artifact must include the raw export when the build and production exports differ",
    );
  }
}

function parseReleaseCompatibility(value: unknown): ReleaseCompatibility {
  if (!isRecord(value)) {
    throw new Error("Release compatibility is invalid");
  }
  const artifactFormatVersion = Number(value.artifactFormatVersion);
  const datasetSchemaVersion = Number(value.datasetSchemaVersion);
  if (
    !Number.isInteger(artifactFormatVersion) ||
    !Number.isInteger(datasetSchemaVersion)
  ) {
    throw new Error("Release compatibility is invalid");
  }
  return { artifactFormatVersion, datasetSchemaVersion };
}

function parseGitHubArtifactMetadata(value: unknown): GitHubArtifactMetadata {
  if (!isRecord(value)) {
    throw new Error("GitHub artifact metadata is invalid");
  }
  const workflowRun = value.workflow_run;
  return {
    expired: typeof value.expired === "boolean" ? value.expired : undefined,
    name: typeof value.name === "string" ? value.name : undefined,
    workflow_run: isRecord(workflowRun)
      ? {
          id: typeof workflowRun.id === "number" ? workflowRun.id : undefined,
        }
      : undefined,
  };
}

function githubArtifactFetcher(
  environment: NodeJS.ProcessEnv,
): FetchArtifactMetadata {
  return async (input: ProjectionDeploymentInput) => {
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
    const metadata: unknown = await response.json();
    return parseGitHubArtifactMetadata(metadata);
  };
}

export async function planProjectionDeployment(
  options: PlanProjectionDeploymentOptions,
): Promise<ProjectionDeploymentPlan> {
  const environment = options.environment ?? process.env;
  const input = deploymentInput(environment);
  const fetchArtifact =
    options.fetchArtifact ?? githubArtifactFetcher(environment);
  const metadata = await fetchArtifact(input);
  validateArtifactMetadata(metadata, input);
  const verified = await verifyProjectionReleaseCoordinate({
    directory: options.directory,
    expectedSha256: input.expectedManifestSha256,
    expectedGroups: input.groups,
    expectedExportId: input.wcaExportValue,
    expectedSourceSha: input.expectedSourceSha,
  });
  const compatibility = parseReleaseCompatibility(
    JSON.parse(await readFile(resolve("release-compatibility.json"), "utf8")),
  );
  if (
    verified.manifest.compatibility.artifactFormatVersion !==
      compatibility.artifactFormatVersion ||
    verified.manifest.compatibility.datasetSchemaVersion !==
      compatibility.datasetSchemaVersion
  ) {
    throw new Error(
      "Projection artifact compatibility does not match the deployed server contract",
    );
  }
  const plan: ProjectionDeploymentPlan = {
    hasRaw: verified.manifest.raw !== null,
    normalizedBuildExport: input.wcaExportValue,
    normalizedProductionExport: input.productionExportValue,
  };
  validateRawRequirement(plan);
  return plan;
}
