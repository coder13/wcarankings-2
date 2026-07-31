import type { SqlTemplateTag } from "@/lib/helpers/database/types";
import { escapeId } from "mysql2";

export const sql: SqlTemplateTag = (strings, ...values) =>
  strings.reduce((query, part, index) => `${query}${part}${values[index] ?? ""}`, "");

export const sqlFragment = sql;

export function escapeSqlIdentifier(value: string) {
  return escapeId(value);
}
