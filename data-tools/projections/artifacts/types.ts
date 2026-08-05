export interface ReleaseCompatibility {
  artifactFormatVersion: number;
  datasetSchemaVersion: number;
}

export interface ArtifactCoordinate {
  digest: string;
  ref: string;
}

export interface RawArtifactCoordinate extends ArtifactCoordinate {
  bytes: number;
  file: string;
  sha256: string;
}

export interface CoordinateManifestGroup {
  artifactDigest: string;
  artifactFingerprint: string;
  artifactRef: string;
  exportDate: string;
  semanticFingerprint: string;
  tables: string[];
  transferTables: string[];
}

export interface ProjectionReleaseCoordinateManifest {
  compatibility: ReleaseCompatibility;
  createdAt: string;
  exportDate: string;
  exportId: string;
  groups: Record<string, CoordinateManifestGroup>;
  mariaDbCompatibilityVersion: string;
  raw: RawArtifactCoordinate | null;
  sourceSha: string;
  version: number;
}

export interface CreateProjectionReleaseCoordinateOptions {
  compatibility: unknown;
  coordinates: unknown;
  directory: string;
  exportDate?: string;
  exportId: string;
  fingerprints: unknown;
  groups: readonly string[];
  raw?: unknown;
  sourceSha: string;
}

export interface CreateProjectionReleaseCoordinateResult {
  manifest: ProjectionReleaseCoordinateManifest;
  path: string;
  sha256: string;
}

export interface VerifyProjectionReleaseCoordinateOptions {
  directory: string;
  expectedExportId?: string;
  expectedGroups?: readonly string[];
  expectedSha256?: string;
  expectedSourceSha?: string;
}

export interface VerifyProjectionReleaseCoordinateResult {
  manifest: ProjectionReleaseCoordinateManifest;
  sha256: string;
}

export interface ReleaseArtifactMetadata {
  bytes: number;
  file: string;
  sha256: string;
}

export interface ProjectionReleaseManifestGroup {
  archive: ReleaseArtifactMetadata;
  artifactDigest: string | null;
  artifactFingerprint: string;
  exportDate: string;
  metadata: ReleaseArtifactMetadata;
  semanticFingerprint: string;
  tables: string[];
  transferTables: string[];
}

export interface ProjectionReleaseManifest {
  compatibility: ReleaseCompatibility;
  createdAt: string;
  exportDate: string;
  exportId: string;
  groups: Record<string, ProjectionReleaseManifestGroup>;
  mariaDbCompatibilityVersion: string;
  raw: ReleaseArtifactMetadata | null;
  sourceSha: string | null;
  sourceTree: string | null;
  version: number;
}

export interface CreateProjectionReleaseManifestOptions {
  artifactDigests?: unknown;
  compatibility?: unknown;
  directory?: string;
  exportDate?: string;
  exportId?: string;
  fingerprints?: unknown;
  groups?: readonly string[];
  rawFile?: string;
  sourceSha?: string;
  sourceTree?: string;
}

export interface CreateProjectionReleaseManifestResult {
  manifest: ProjectionReleaseManifest;
  manifestPath: string;
  manifestSha256: string;
}

export interface VerifyProjectionReleaseManifestOptions {
  directory?: string;
  expectedExportId?: string;
  expectedFingerprints?: unknown;
  expectedGroups?: readonly string[];
  expectedSha256?: string;
  expectedSourceSha?: string;
}

export interface VerifyProjectionReleaseManifestResult {
  manifest: ProjectionReleaseManifest;
  manifestSha256: string;
}
