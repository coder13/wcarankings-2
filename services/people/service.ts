import {
  fetchPersonIdsFromDatabase,
  fetchPersonSearchRowsFromDatabase,
} from "@/services/people/database";
import {
  fetchPersonThumbnailsFromWca,
  getCachedPersonThumbnail,
} from "@/services/thumbnails/wca-person-thumbnails";
import { buildPersonSearchPayload, parsePersonSearchInput } from "@/services/people/helpers";
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
      entries: parts.payload.data.entries.map((entry) => ({
        ...entry,
        avatarUrl: thumbs[entry.personId] ?? entry.avatarUrl,
      })),
    },
  };
}
