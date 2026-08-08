import { query } from "@/db";
import { discoverRecentResultReferences } from "./recent-changes";

function placeholders(count: number) {
  return Array.from({ length: count }, () => "?").join(", ");
}

export async function benchmarkAffectedSorLookup({ now }: { now?: Date } = {}) {
  const { references } = await discoverRecentResultReferences({ now });
  const personIds = [
    ...new Set(references.map((reference) => reference.personId)),
  ];
  const countryIds = [
    ...new Set(
      references.map((reference) => reference.countryId).filter(Boolean),
    ),
  ];
  const continentIds = [
    ...new Set(
      references.map((reference) => reference.continentId).filter(Boolean),
    ),
  ];
  const genders = [
    ...new Set(
      references
        .map((reference) => reference.gender)
        .filter(
          (gender): gender is "f" | "o" => gender === "f" || gender === "o",
        ),
    ),
  ];
  const regions = [
    { scope: "world", ids: [""] },
    { scope: "continent", ids: continentIds },
    { scope: "country", ids: countryIds },
  ].filter((region) => region.ids.length > 0);
  if (personIds.length === 0) {
    return {
      referenceCount: references.length,
      personCount: 0,
      regionCount: 0,
      genderCount: 0,
      elapsedMs: 0,
      rows: 0,
      historicalAsOfSupported: false,
    };
  }

  const regionSql = regions
    .map(
      (region) =>
        `(scope = ? AND region_id IN (${placeholders(region.ids.length)}))`,
    )
    .join(" OR ");
  const values: unknown[] = [];
  for (const region of regions) values.push(region.scope, ...region.ids);
  values.push(...personIds, ...genders);
  const startedAt = performance.now();
  const result = await query(
    `SELECT person_id, result_type, scope, region_id, gender, score, rank, position
       FROM person_sum_of_ranks_scores
      WHERE metric_version = 1
        AND event_set_version = 1
        AND (${regionSql})
        AND person_id IN (${placeholders(personIds.length)})
        AND gender IN (${placeholders(genders.length || 1)})`,
    genders.length ? values : [...values, "o"],
  );
  return {
    referenceCount: references.length,
    personCount: personIds.length,
    regionCount: regions.reduce(
      (count, region) => count + region.ids.length,
      0,
    ),
    genderCount: genders.length,
    elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100,
    rows: result.rows.length,
    historicalAsOfSupported: false,
  };
}
