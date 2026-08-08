import { getRecordBadges, type RankingEntry } from "@/lib/wca";
import type { PersonMetricRow, RankingRow } from "@/services/rankings/types";

export function toRankingEntry(row: RankingRow): RankingEntry {
  return {
    resultId: Number(row.result_id),
    rank: Number(row.rank),
    subRank: Number(row.sub_rank),
    personId: row.person_id,
    personName: row.person_name,
    countryId: row.country_id,
    countryName: row.country_name,
    countryIso2: row.country_iso2,
    continentId: row.continent_id,
    best: Number(row.best),
    competitionId: row.competition_id,
    competitionName: row.competition_name,
    recordBadges: getRecordBadges({
      isWorldRecord: Number(row.is_world_record) === 1,
      isContinentRecord: Number(row.is_continent_record) === 1,
      isCountryRecord: Number(row.is_country_record) === 1,
      continentId: row.continent_id,
    }),
  };
}

export function toPersonMetricEntry(row: PersonMetricRow): RankingEntry {
  return {
    rank: Number(row.rank),
    subRank: Number(row.sub_rank),
    personId: row.person_id,
    personName: row.person_name,
    countryId: row.country_id,
    countryName: row.country_name,
    countryIso2: row.country_iso2,
    continentId: row.continent_id,
    best: Number(row.best),
    competitionId: "",
    competitionName: "",
    recordBadges: [],
  };
}
