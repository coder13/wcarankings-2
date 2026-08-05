import type { Connection, RowDataPacket } from "mysql2/promise";

export type ProjectionConnection = Connection;

export type IndexDefinition = readonly [string, string, string, string];

export interface TableTypeRow extends RowDataPacket {
  type: "BASE TABLE" | "VIEW";
}
