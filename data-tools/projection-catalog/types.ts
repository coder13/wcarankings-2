type ProjectionSubject = "people" | "competitions" | "countries";
type ProjectionJobKind = "semantic" | "core";

export interface ProjectionJob {
  id: string;
  dependencies: readonly string[];
  sqlFiles: readonly string[];
  tables: readonly string[];
  releaseGroup: string;
  releaseOrder?: number;
  releaseSchemaVersion: number;
  estimatedDurationMs?: number;
  kind?: ProjectionJobKind;
  enabledByDefault?: boolean;
  subject?: ProjectionSubject;
  stat?: string;
}
