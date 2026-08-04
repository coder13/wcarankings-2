import { query } from "@/db";
import type {
  ListRegionRow,
  ListRegions,
  ListRegionSelection,
  ListSummary,
} from "@/services/lists/types";
import {
  dynamicListRegionsQuery,
  listRegionsQuery,
} from "@/services/lists/queries";

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
  const result = await query<ListRegionRow>(listRegionsQuery(), [list.id]);
  return toListRegions(result.rows);
}

export async function getDynamicListRegions(
  personIds: string[],
): Promise<ListRegions> {
  if (!personIds.length) return { continents: [], countries: [] };
  const result = await query<ListRegionRow>(
    dynamicListRegionsQuery(personIds.length),
    personIds,
  );
  return toListRegions(result.rows);
}

export function normalizeListRegionSelection(
  selection: ListRegionSelection,
  regions: ListRegions,
) {
  if (!hasMultipleListCountries(regions)) {
    return { scope: "world" as const, regionId: "" };
  }
  if (selection.scope === "world") return selection;
  const allowed =
    selection.scope === "continent" ? regions.continents : regions.countries;
  return allowed.some((region) => region.id === selection.regionId)
    ? selection
    : { scope: "world" as const, regionId: "" };
}

export function hasMultipleListCountries(regions: ListRegions) {
  return regions.countries.length > 1;
}
