import type { ExportDateInput } from "../../shared/date.ts";

interface SemanticFingerprintGroup {
  inputs: string[];
  semanticDigest: string;
  semanticFingerprint: string;
}

export interface SemanticFingerprintSet {
  groups: Record<string, SemanticFingerprintGroup>;
  version: number;
}

export interface ArtifactFingerprintGroup extends SemanticFingerprintGroup {
  artifactDigest: string;
  artifactFingerprint: string;
  dependencies: Record<string, string>;
}

export interface ArtifactFingerprintSet {
  artifactFormatVersion: number;
  exportId: string;
  groups: Record<string, ArtifactFingerprintGroup>;
  mariaDbCompatibilityVersion: string;
  semanticVersion: number;
  version: number;
}

export interface ProjectionSemanticPlan extends SemanticFingerprintSet {
  changedGroups: string[];
  changedGroupsCsv: string;
  changedRoots: string[];
  required: boolean;
}

export interface ProjectionReleasePlan extends ArtifactFingerprintSet {
  activeGroups: string[];
  buildGroups: string[];
  buildGroupsCsv: string;
  cachedGroups: string[];
  changedGroups: string[];
  exportChanged: boolean;
  hydrateGroups: string[];
  hydrateGroupsCsv: string;
  productionExportId: ExportDateInput;
  releaseGroups: string[];
  required: boolean;
  requiredGroups: string[];
  requiredGroupsCsv: string;
  selectedGroups: string[];
  semanticChangeRequired: boolean;
}

export interface SemanticFingerprintOptions {
  repositoryRoot?: string;
}

export interface ProjectionSemanticPlanOptions extends SemanticFingerprintOptions {
  forceRebuild?: boolean;
  productionState?: unknown;
  selectedGroups?: readonly string[];
}

export interface ProjectionFingerprintOptions extends SemanticFingerprintOptions {
  exportId?: ExportDateInput;
  semanticFingerprints?: SemanticFingerprintSet;
}

export interface ProjectionReleasePlanOptions extends SemanticFingerprintOptions {
  availableArtifacts?: unknown;
  exportId?: ExportDateInput;
  forceRebuild?: boolean;
  productionExportId?: ExportDateInput;
  productionState?: unknown;
  selectedGroups?: readonly string[];
}
