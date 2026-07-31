import { ApiInputError } from "@/lib/api/projection";
import {
  fetchPersonIdsFromDatabase,
  fetchPersonSearchRowsFromDatabase,
} from "@/lib/data/person-search-database";
import {
  fetchPersonThumbnailsFromWca,
  getCachedPersonThumbnail,
} from "@/services/thumbnails/wca-person-thumbnails";
import { isValidRegexPattern } from "@/lib/wca";

export async function searchPersonIds(search: string, regexSearch: boolean, limit: number) {
  if (regexSearch && !isValidRegexPattern(search)) throw new Error("Invalid regular expression.");
  const result = await fetchPersonIdsFromDatabase({ search, regexSearch, limit });
  return {
    personIds: result.rows.map((row) => row.wca_id),
    timings: result.timings,
    returnedRows: result.rows.length,
  };
}

type PersonSearchInput = {
  search: string;
  regexSearch: boolean;
  limit: number;
  offset: number;
};

function parsePersonSearchInput(params: URLSearchParams): PersonSearchInput {
  const search = (params.get("q") ?? "").trim().slice(0, 80);
  if (!search) throw new ApiInputError("q is required.");
  const mode = params.get("mode") ?? "prefix";
  if (mode !== "prefix" && mode !== "regex") throw new ApiInputError("mode must be prefix or regex.");
  const regexSearch = mode === "regex";
  if (regexSearch && !isValidRegexPattern(search)) throw new ApiInputError("Invalid regular expression.");
  const limit = Number(params.get("limit") ?? 20);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new ApiInputError("limit must be between 1 and 50.");
  }
  const offset = Number(params.get("offset") ?? 0);
  if (!Number.isInteger(offset) || offset < 0) throw new ApiInputError("offset must be a non-negative integer.");
  return { search, regexSearch, limit, offset };
}

function buildPersonSearchPayload(rows: Awaited<ReturnType<typeof fetchPersonSearchRowsFromDatabase>>["rows"], input: PersonSearchInput, mode: string) {
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

export async function loadPersonSearchParts(params: URLSearchParams) {
  const input = parsePersonSearchInput(params);
  const mode = input.regexSearch ? "regex" : "prefix";
  const result = await fetchPersonSearchRowsFromDatabase(input);
  const rows = result.rows.map((row) => ({
    ...row,
    avatar_url: getCachedPersonThumbnail(row.wca_id) ?? row.avatar_url,
  }));
  const personIds = rows.map((row) => row.wca_id);
  const thumbs = fetchPersonThumbnailsFromWca(
    input.search,
    personIds,
    Math.floor(input.offset / input.limit) + 1,
    input.limit,
  ).catch(() => new Map<string, string | null>());
  return {
    thumbs: thumbs.then((values) => Object.fromEntries(values)),
    payload: {
      ...buildPersonSearchPayload(rows, input, mode),
      diagnostics: { timings: result.timings, queryCount: 2, returnedRows: rows.length },
    },
  };
}

export async function loadPersonSearch(params: URLSearchParams) {
  const parts = await loadPersonSearchParts(params);
  const thumbs = await parts.thumbs;
  return {
    ...parts.payload,
    data: {
      ...parts.payload.data,
      entries: parts.payload.data.entries.map((entry) => ({ ...entry, avatarUrl: thumbs[entry.personId] ?? entry.avatarUrl })),
    },
  };
}
