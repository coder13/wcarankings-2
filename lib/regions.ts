import { query } from "@/db";
import type { WcaCountry } from "@/lib/data/types";
import { FALLBACK_CONTINENTS, FALLBACK_COUNTRIES } from "@/lib/wca";
import type { RankingRegionRow, RegionKind, RegionRecord } from "@/lib/data/types";

const regionRequests = new Map<RegionKind, Promise<RegionRecord[]>>();
let countriesRequest: Promise<WcaCountry[]> | null = null;

function getWcaCountries() {
  if (!countriesRequest) {
    countriesRequest = fetch("https://www.worldcubeassociation.org/api/v0/countries", {
      signal: AbortSignal.timeout(5000),
    }).then(async (response) => {
      if (!response.ok) return [];
      const data = await response.json() as unknown;
      if (!Array.isArray(data)) return [];
      return data.filter((country): country is WcaCountry => (
        typeof country === "object" && country !== null &&
        "id" in country && typeof country.id === "string" &&
        "name" in country && typeof country.name === "string"
      ));
    }).catch(() => []);
  }
  return countriesRequest;
}

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
