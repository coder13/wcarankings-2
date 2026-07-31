import { ApiInputError } from "@/lib/api/projection";
import { isValidRegexPattern } from "@/lib/wca";
import type { PersonSearchInput, PersonSearchRow } from "@/services/people/types";

export function escapeLikePrefix(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

export function parsePersonSearchInput(params: URLSearchParams): PersonSearchInput {
  const search = (params.get("q") ?? "").trim().slice(0, 80);
  if (!search) throw new ApiInputError("q is required.");
  const mode = params.get("mode") ?? "prefix";
  if (mode !== "prefix" && mode !== "regex")
    throw new ApiInputError("mode must be prefix or regex.");
  const regexSearch = mode === "regex";
  if (regexSearch && !isValidRegexPattern(search))
    throw new ApiInputError("Invalid regular expression.");
  const limit = Number(params.get("limit") ?? 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50)
    throw new ApiInputError("limit must be between 1 and 50.");
  const offset = Number(params.get("offset") ?? 0);
  if (!Number.isInteger(offset) || offset < 0)
    throw new ApiInputError("offset must be a non-negative integer.");
  return { search, regexSearch, limit, offset };
}

export function buildPersonSearchPayload(
  rows: PersonSearchRow[],
  input: PersonSearchInput,
  mode: string,
) {
  return {
    data: {
      entries: rows.map((row) => ({
        personId: row.wca_id,
        name: row.name,
        avatarUrl: row.avatar_url,
        competitionCount: Number(row.competition_count),
        country: { id: row.country_id, name: row.country_name, iso2: row.country_iso2 },
      })),
      context: { resource: "person-search", query: input.search, mode },
      page: { limit: input.limit, hasMore: rows.length === input.limit, next: null },
      total: Number(rows[0]?.total_count ?? 0),
    },
  };
}
