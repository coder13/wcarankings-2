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

export interface ExportMetadataRow extends RowDataPacket {
  value: string;
}

export interface MariaDbImportResult {
  code: number | null;
  signal: NodeJS.Signals | null;
}
