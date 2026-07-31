import type { GenderFilter, RankingType, RegionScope } from "@/lib/wca";

export function rankingTable(type: RankingType) {
  return type === "average" ? "ranking_entries_average" : "ranking_entries_single";
}

export function yearlyRankingTable(type: RankingType) {
  return type === "average" ? "person_year_rankings_average" : "person_year_rankings_single";
}

export function rankingShape(scope: RegionScope) {
  if (scope === "continent")
    return {
      rank: "continent_rank",
      subRank: "continent_sub_rank",
      region: "continent_id",
    } as const;
  if (scope === "country")
    return { rank: "country_rank", subRank: "country_sub_rank", region: "country_id" } as const;
  return { rank: "world_rank", subRank: "world_sub_rank", region: null } as const;
}

export function rankingColumns(rank: string, subRank: string) {
  return `${rank} AS rank, ${subRank} AS sub_rank, person_id, person_name, country_id, country_name, country_iso2, continent_id, best, competition_id, competition_name, is_world_record, is_continent_record, is_country_record`;
}

export function genderCondition(alias: string, genders: readonly GenderFilter[]) {
  if (!genders.length) return { sql: "", values: [] as unknown[] };
  const parts = genders.map((gender) =>
    gender === "o" ? `(${alias}.gender = 'o' OR ${alias}.gender IS NULL)` : `${alias}.gender = ?`,
  );
  return { sql: `(${parts.join(" OR ")})`, values: genders.filter((gender) => gender !== "o") };
}

export function countKey(eventId: string, type: RankingType, scope: RegionScope, regionId: string) {
  return `${eventId}:${type}:${scope}:${regionId}`;
}

export function yearCountKey(
  year: number,
  eventId: string,
  type: RankingType,
  scope: RegionScope,
  regionId: string,
) {
  return `${year}:${countKey(eventId, type, scope, regionId)}`;
}

export function rankingPageKey({
  year,
  type,
  scope,
  regionId,
  startRank,
}: {
  year?: number | null;
  type: RankingType;
  scope: RegionScope;
  regionId: string;
  startRank: number;
}) {
  return `${year ?? "all"}:${type}:${scope}:${regionId}:${startRank}`;
}

export function isPermanentPage(key: {
  year?: number | null;
  scope: RegionScope;
  startRank: number;
}) {
  return !key.year && key.scope === "world" && key.startRank === 1;
}
