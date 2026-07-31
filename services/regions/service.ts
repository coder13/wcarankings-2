import { query } from "@/db";
import { FALLBACK_CONTINENTS, FALLBACK_COUNTRIES } from "@/lib/wca";
import { getWcaCountries } from "@/services/regions/helpers";
import type { RankingRegionRow, RegionKind, RegionRecord } from "@/services/regions/types";

const regionRequests = new Map<RegionKind, Promise<RegionRecord[]>>();

async function loadRegions(kind: RegionKind): Promise<RegionRecord[]> {
  try {
    if (kind === "country") {
      const wcaCountries = await getWcaCountries();
      if (wcaCountries.length > 0) return wcaCountries;
    }

    const idColumn = kind === "continent" ? "continent_id" : "country_id";
    const nameColumn = kind === "continent" ? "continent_id" : "country_name";
    const isoColumn = kind === "continent" ? "''" : "country_iso2";
    const result = await query<RankingRegionRow>(
      `SELECT DISTINCT ${idColumn} AS id, ${nameColumn} AS name, ${isoColumn} AS iso2
       FROM ranking_entries
       ORDER BY name`,
    );
    return result.rows;
  } catch {
    return kind === "continent" ? FALLBACK_CONTINENTS : FALLBACK_COUNTRIES;
  }
}

export function getRegions(kind: RegionKind) {
  const cached = regionRequests.get(kind);
  if (cached) return cached;
  const request = loadRegions(kind);
  regionRequests.set(kind, request);
  return request;
}
