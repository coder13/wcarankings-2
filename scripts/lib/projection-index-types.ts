export interface ProjectionIndexSource {
  file: string;
  table: string;
  sourceTable?: string;
}

export interface ProjectionIndexGroup {
  indexSources?: ProjectionIndexSource[];
}

export interface SecondaryIndex {
  name: string;
  sql: string;
}

export interface ExtractedProjectionIndex extends SecondaryIndex {
  table: string;
}

export interface AlterTable {
  prefix: string;
  table: string;
  clauses: string[];
}
