import type { RowDataPacket } from "mysql2/promise";
import type { Readable, Writable } from "node:stream";
import type { DeploymentProjectionGroup } from "../../projection-catalog/groups.ts";
import type { ProjectionConnection } from "../shared/database-types.ts";

export interface PrepareProjectionTransferInput {
  connection: ProjectionConnection;
  group: DeploymentProjectionGroup;
}

export interface PrepareProjectionTransferResult {
  deferredIndexCount: number;
  exportDate: string;
  group: string;
  tables: string[];
}

export interface ExportDateRow extends RowDataPacket {
  export_date?: string;
  value?: string;
}

export interface CountRow extends RowDataPacket {
  count: number | string;
}

export interface ShowIndexRow extends RowDataPacket {
  Collation: "A" | "D" | null;
  Column_name: string;
  Key_name: string;
  Non_unique: number;
  Seq_in_index: number;
  Sub_part: number | null;
}

export interface DeferredProjectionIndex {
  name: string;
  sql: string;
}

export interface DeferredIndexRow extends RowDataPacket {
  index_name: string;
  index_sql: string;
  table_name: string;
}

export type ProjectionTransferPublishMode = "hydrate" | "prepare" | "publish";

type TransferConnectionFactory = () => Promise<ProjectionConnection>;

type TransferLogger = (message: string) => void;

export interface PublishProjectionTransferInput {
  connection: ProjectionConnection;
  createConnection: TransferConnectionFactory;
  expectedExportDate?: string;
  groups: readonly DeploymentProjectionGroup[];
  indexConcurrency: number;
  log?: TransferLogger;
  mode: ProjectionTransferPublishMode;
}

export interface PublishProjectionTransferResult {
  builtIndexCount: number;
  exportDate: string;
  groups: string[];
  mode: ProjectionTransferPublishMode;
  tables: string[];
}

export interface ProjectionTransferMetadata {
  [property: string]: unknown;
  archiveFile?: string;
  exportDate?: string;
  files?: string[];
  format?: string;
  group: string;
  tables: string[];
}

export interface ExportProjectionTransferInput {
  metadataPath: string;
  outputPath: string;
}

export interface ExportProjectionTransferResult {
  metadata: ProjectionTransferMetadata;
  metadataPath: string;
  outputPath: string;
}

export interface DatabaseConnectionOptions {
  database: string;
  host: string;
  password: string;
  port: number;
  user: string;
}

export interface ImportProjectionTransferInput {
  concurrency: number;
  directory: string;
  log?: TransferLogger;
  metadataPath: string;
  options: DatabaseConnectionOptions;
}

export interface ImportProjectionTransferResult {
  loadedTables: string[];
}

export interface ChunkProjectionDumpInput {
  importDump: boolean;
  input: Readable;
  output: Writable;
  rowsPerInsert: number;
}
