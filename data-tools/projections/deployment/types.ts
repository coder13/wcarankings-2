export interface ProjectionDeploymentInput {
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
}

export interface GitHubArtifactMetadata {
  expired?: boolean;
  name?: string;
  workflow_run?: GitHubWorkflowRun;
}

interface GitHubWorkflowRun {
  id?: number;
}

export interface ProjectionDeploymentPlan {
  hasRaw: boolean;
  normalizedBuildExport: string;
  normalizedProductionExport: string;
}

export type FetchArtifactMetadata = (
  input: ProjectionDeploymentInput,
) => Promise<GitHubArtifactMetadata>;

export interface PlanProjectionDeploymentOptions {
  directory: string;
  environment?: NodeJS.ProcessEnv;
  fetchArtifact?: FetchArtifactMetadata;
}

export interface ServerDatasetCompatibility {
  maximumDatasetSchemaVersion?: number;
  minimumDatasetSchemaVersion?: number;
}

export interface CheckServerDatasetCompatibilityInput {
  datasetSchemaVersion: number | string;
  server?: ServerDatasetCompatibility;
}

export interface DatasetCompatibilityResult {
  compatible: true;
  datasetSchemaVersion: number;
  maximum: number;
  minimum: number;
}
