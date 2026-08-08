import type { Connection, RowDataPacket } from "mysql2/promise";
import type { Sql } from "sql-template-tag";

export const required = (value: string | undefined, name: string): string => {
  if (!value) throw new Error(`Projection job is missing ${name}.`);
  return value;
};

export const queryOne = async <T extends RowDataPacket>(
  connection: Connection,
  query: Sql,
  values: readonly unknown[],
): Promise<T | undefined> => {
  const [rows] = await connection.query<T[]>(query.sql, [
    ...query.values,
    ...values,
  ]);
  return rows[0];
};
