import type { RowDataPacket } from "mysql2/promise";

export interface ProjectionTableRequirement {
  columns?: readonly string[];
  indexes?: readonly string[];
  table: string;
}

export interface ProjectionVerificationResult {
  checkedTables: string[];
  issues: string[];
  ready: boolean;
}

export interface TableNameRow extends RowDataPacket {
  name: string;
}

export interface ColumnNameRow extends RowDataPacket {
  column_name: string;
  table_name: string;
}

export interface IndexNameRow extends RowDataPacket {
  index_name: string;
  table_name: string;
}

export interface MetadataRow extends RowDataPacket {
  value: string;
}
