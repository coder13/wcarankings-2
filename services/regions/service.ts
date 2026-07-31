import { query } from "@/db";
import { FALLBACK_CONTINENTS, FALLBACK_COUNTRIES } from "@/lib/wca";
import { getWcaCountries } from "@/services/regions/helpers";
import { rankingRegionsQuery } from "@/services/regions/queries";
import type { RankingRegionRow, RegionKind, RegionRecord } from "@/services/regions/types";

const regionRequests = new Map<RegionKind, Promise<RegionRecord[]>>();

async function loadRegions(kind: RegionKind): Promise<RegionRecord[]> {
  try {
    if (kind === "country") {
      const wcaCountries = await getWcaCountries();
      if (wcaCountries.length > 0) return wcaCountries;
    }

    const result = await query<RankingRegionRow>(rankingRegionsQuery(kind));
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
