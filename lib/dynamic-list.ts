import type { RowDataPacket } from "mysql2/promise";
import { query } from "@/db";

export const MAX_DYNAMIC_LIST_MEMBERS = 100;

export class DynamicListInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DynamicListInputError";
  }
}

function normalizeWcaId(value: string) {
  const personId = value.trim().toUpperCase();
  return /^\d{4}[A-Z0-9]{4}\d{2}$/.test(personId) ? personId : null;
}

export function parseDynamicListIds(value: string | string[] | undefined) {
  const values = Array.isArray(value) ? value : [value ?? ""];
  const invalidIds: string[] = [];
  const personIds: string[] = [];
  const seen = new Set<string>();

  for (const rawId of values.flatMap((entry) => entry.split(","))) {
    const trimmed = rawId.trim();
    if (!trimmed) continue;
    const personId = normalizeWcaId(trimmed);
    if (!personId) {
      invalidIds.push(trimmed.slice(0, 40));
      continue;
    }
    if (!seen.has(personId)) {
      seen.add(personId);
      personIds.push(personId);
    }
  }

  if (personIds.length > MAX_DYNAMIC_LIST_MEMBERS) {
    throw new DynamicListInputError(`Dynamic lists support up to ${MAX_DYNAMIC_LIST_MEMBERS} people.`);
  }
  return { personIds, invalidIds };
}

export async function resolveDynamicList(personIds: string[]) {
  if (!personIds.length) return { personIds: [], unknownIds: [] };
  const placeholders = personIds.map(() => "?").join(",");
  const result = await query<RowDataPacket & { wca_id: string }>(
    `SELECT wca_id
     FROM persons
     WHERE sub_id = 1 AND wca_id IN (${placeholders})`,
    personIds,
  );
  const known = new Set(result.rows.map((row) => row.wca_id));
  return {
    personIds: personIds.filter((personId) => known.has(personId)),
    unknownIds: personIds.filter((personId) => !known.has(personId)),
  };
}

export function dynamicListQueryValue(personIds: string[]) {
  return personIds.join(",");
}
