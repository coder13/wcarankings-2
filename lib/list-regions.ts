import { query } from "@/db";
import type { ListSummary } from "@/lib/lists";
import type { RegionScope } from "@/lib/wca";

export type ListRegions = {
  continents: Array<{ id: string; name: string }>;
  countries: Array<{ id: string; name: string; iso2: string }>;
};

type ListRegionRow = {
  country_id: string;
  country_name: string;
  country_iso2: string;
  continent_id: string;
};

function toListRegions(rows: ListRegionRow[]): ListRegions {
  const continentIds = new Set<string>();
  return {
    continents: rows.flatMap((row) => {
      if (!row.continent_id || continentIds.has(row.continent_id)) return [];
      continentIds.add(row.continent_id);
      return [{ id: row.continent_id, name: row.continent_id }];
    }),
    countries: rows.map((row) => ({
      id: row.country_id,
      name: row.country_name,
      iso2: row.country_iso2,
    })),
  };
}

export async function getListRegions(list: ListSummary): Promise<ListRegions> {
  const result = await query<ListRegionRow>(
    `SELECT DISTINCT
       country.id AS country_id,
       country.name AS country_name,
       country.iso2 AS country_iso2,
       country.continent_id
     FROM list_members AS member
     JOIN persons AS person
       ON person.wca_id = member.person_id
      AND person.sub_id = 1
     JOIN countries AS country ON country.id = person.country_id
     WHERE member.list_id = ?
     ORDER BY country.name, country.id`,
    [list.id],
  );
  return toListRegions(result.rows);
}

export async function getDynamicListRegions(personIds: string[]): Promise<ListRegions> {
  if (!personIds.length) return { continents: [], countries: [] };
  const placeholders = personIds.map(() => "?").join(",");
  const result = await query<ListRegionRow>(
    `SELECT DISTINCT
       country.id AS country_id,
       country.name AS country_name,
       country.iso2 AS country_iso2,
       country.continent_id
     FROM persons AS person
     JOIN countries AS country ON country.id = person.country_id
     WHERE person.sub_id = 1 AND person.wca_id IN (${placeholders})
     ORDER BY country.name, country.id`,
    personIds,
  );
  return toListRegions(result.rows);
}

export function normalizeListRegionSelection(
  selection: { scope: RegionScope; regionId: string },
  regions: ListRegions,
) {
  if (!hasMultipleListCountries(regions)) {
    return { scope: "world" as const, regionId: "" };
  }
  if (selection.scope === "world") return selection;
  const allowed = selection.scope === "continent"
    ? regions.continents
    : regions.countries;
  return allowed.some((region) => region.id === selection.regionId)
    ? selection
    : { scope: "world" as const, regionId: "" };
}

export function hasMultipleListCountries(regions: ListRegions) {
  return regions.countries.length > 1;
}
