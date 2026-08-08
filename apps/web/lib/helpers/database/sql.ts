import type { SqlTemplateTag } from "@/lib/helpers/database/types";
import { escapeId } from "mysql2";
import sqlTemplate, { raw } from "sql-template-tag";

/**
 * Composes trusted SQL fragments. Runtime data must stay in `?` placeholders
 * and be passed separately to the database executor.
 */
export const sqlFragment: SqlTemplateTag = (strings, ...values) =>
  sqlTemplate(strings, ...values.map((value) => raw(String(value)))).sql;

export function escapeSqlIdentifier(value: string) {
  return escapeId(value);
}
