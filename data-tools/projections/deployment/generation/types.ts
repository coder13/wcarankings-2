import type { RowDataPacket } from "mysql2/promise";
import type { ProjectionConnection } from "../../shared/database-types.ts";

export type GenerationConnection = ProjectionConnection;

interface GenerationManifestCompatibility {
  artifactFormatVersion: number;
  datasetSchemaVersion: number;
}

export interface GenerationManifestGroup {
  artifactDigest?: string | null;
  artifactFingerprint: string;
  semanticFingerprint: string;
}

export interface GenerationManifest {
  compatibility: GenerationManifestCompatibility;
  exportId: string;
  groups: Record<string, GenerationManifestGroup>;
  raw: unknown | null;
  sourceSha: string;
  version: number;
}

export interface GenerationState {
  activationTables: string[];
  artifactDigests: Record<string, string | null>;
  artifactFingerprints: Record<string, string>;
  artifactFormatVersion: number;
  artifactId: number;
  artifactRunId: number;
  capabilities: Record<string, boolean>;
  datasetSchemaVersion: number;
  exportId: string;
  generationId: string;
  previousTables: string[];
  semanticFingerprints: Record<string, string>;
  sourceSha: string;
}

interface GenerationStateSeed {
  activationTables?: string[];
  artifactDigests?: Record<string, string | null>;
  artifactFingerprints?: Record<string, string>;
  capabilities?: Record<string, boolean>;
  previousTables?: string[];
  semanticFingerprints?: Record<string, string>;
}

export interface GenerationIdentityInput {
  activeState: GenerationStateSeed | null;
  artifactId: number | string;
  artifactRunId: number | string;
  manifest: GenerationManifest;
}

export interface MatchActiveGenerationInput {
  activeState: GenerationState | null;
  artifactId: number | string;
  artifactRunId: number | string;
  manifest: GenerationManifest;
}

export interface BootstrapGenerationStateInput {
  connection: GenerationConnection;
  productionSchema: string;
}

export interface BootstrapGenerationStateResult {
  bootstrapped: boolean;
  state: GenerationState;
}

export interface ActivateGenerationInput {
  artifactId: number | string;
  artifactRunId: number | string;
  candidateSchema: string;
  connection: GenerationConnection;
  failurePoint?: string;
  manifest: GenerationManifest;
  previousSchema: string;
  productionSchema: string;
}

export interface ActivateGenerationResult {
  alreadyActive: boolean;
  state: GenerationState;
}

export interface RollbackGenerationInput {
  artifactId: number | string;
  candidateSchema: string;
  connection: GenerationConnection;
  productionSchema: string;
}

export interface RollbackGenerationResult {
  reason?: string;
  rolledBack: boolean;
}

export interface TableNameRow extends RowDataPacket {
  name: string;
}

export interface LockRow extends RowDataPacket {
  acquired: number | string;
}

export interface ExportMetadataRow extends RowDataPacket {
  key: string;
  value: string;
}

export interface ExportValueRow extends RowDataPacket {
  value: string;
}

export interface GenerationStateRow extends RowDataPacket {
  activation_tables_json: string;
  artifact_format_version: number | string;
  artifact_id: number | string;
  artifact_run_id: number | string;
  capabilities_json: string;
  dataset_schema_version: number | string;
  export_id: string;
  fingerprints_json: string;
  generation_id: string;
  previous_tables_json: string;
  source_sha: string;
}
