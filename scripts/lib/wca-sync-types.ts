import type { RowDataPacket } from "mysql2/promise";

export interface WcaExportMetadata {
  exportDate: string;
  sqlUrl: string;
  version: string;
}

export interface SyncWcaOptions {
  canonicalExportDate: string;
  dryRun: boolean;
  force: boolean;
  rawOnly: boolean;
  selectedProjectionNames: string[];
  suppliedPath?: string;
}

type ImportRunFieldValue = Date | number | string | null;
export type ImportRunFields = Record<string, ImportRunFieldValue>;

export interface ImportCoverageRow extends RowDataPacket {
  aggregates: number | string;
  events: number | string;
  people: number | string;
  rankings: number | string;
  regions: number | string;
  result_aggregates: number | string;
  result_entries: number | string;
  results: number | string;
}

export interface ExportMetadataRow extends RowDataPacket {
  value: string;
}

export interface MariaDbImportResult {
  code: number | null;
  signal: NodeJS.Signals | null;
}
