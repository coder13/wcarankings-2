import { formatWcaResult } from "@/lib/wca";
import { loadCityRankings } from "@/services/rankings/city-rankings";
import { loadCompetitionRankings } from "@/services/rankings/competition-rankings";
import { loadPersonCompetitionRankings } from "@/services/rankings/person-competitions";
import { loadPersonMedalRankings } from "@/services/rankings/medals";
import { loadRankingsWithDiagnostics } from "@/services/rankings/service";
import { loadResultRankings } from "@/services/rankings/result";
import type { RankingDocumentTitleInput } from "@/lib/ranking-document-title";

export type RankingPageEntry = {
  rank: number;
  personId: string;
  personName: string;
  identitySubtitle?: string;
  countryName?: string;
  countryIso2?: string;
  best: number;
  formattedValue?: string;
  competitionName?: string;
  recordBadges?: string[];
};

function rankingParams(
  params: URLSearchParams,
  start: number,
  input: RankingDocumentTitleInput,
): URLSearchParams {
  const rankingParams = new URLSearchParams(params);
  if (input.eventId !== "all") rankingParams.set("eventId", input.eventId);
  if (!rankingParams.has("result")) {
    rankingParams.set("result", input.rankingType);
  }
  rankingParams.set("start", String(start));
  rankingParams.set("limit", "3");
  rankingParams.delete("cursor");
  rankingParams.delete("cursorRank");
  rankingParams.delete("cursorId");
  return rankingParams;
}

function entryLabel(
  entry: RankingPageEntry,
  input: RankingDocumentTitleInput,
): string {
  const value =
    entry.formattedValue ??
    formatWcaResult(
      input.eventId,
      entry.best,
      input.rankingType === "average" ? "average" : "single",
    );
  return `${entry.personName} (${value})`;
}

export async function loadTopRankingEntries(
  params: URLSearchParams,
  input: RankingDocumentTitleInput,
): Promise<RankingPageEntry[]> {
  if (input.listName) return [];

  if (input.subject === "results") {
    const result = await loadResultRankings(rankingParams(params, 0, input));
    return result.data.entries.slice(0, 3);
  }

  if (input.subject === "competitions") {
    let ranking: "fastest" | "podium" | "competitor-count" | "latitude" =
      "fastest";
    if (input.competitionRanking === "podiums") ranking = "podium";
    else if (input.competitionRanking === "competitor-count")
      ranking = "competitor-count";
    else if (input.competitionRanking === "latitude") ranking = "latitude";
    const rankingParamsForCompetitions = rankingParams(params, 0, input);
    rankingParamsForCompetitions.set("ranking", ranking);
    const result = await loadCompetitionRankings(
      rankingParamsForCompetitions,
    );
    return result.data.entries.slice(0, 3) as RankingPageEntry[];
  }

  if (input.subject === "cities") {
    const cityParams = rankingParams(params, 0, input);
    if (input.cityRanking === "fastest-single") {
      cityParams.delete("stat");
      cityParams.set("result", "single");
    } else if (input.cityRanking === "fastest-average") {
      cityParams.delete("stat");
      cityParams.set("result", "average");
    } else {
      cityParams.set("stat", input.cityRanking);
    }
    const result = await loadCityRankings(cityParams);
    return result.data.entries.slice(0, 3) as RankingPageEntry[];
  }

  if (input.personCompetitionRanking) {
    const result = await loadPersonCompetitionRankings(
      rankingParams(params, 1, input),
    );
    return result.data.entries.slice(0, 3) as RankingPageEntry[];
  }

  if (input.personMedalRanking) {
    const result = await loadPersonMedalRankings(rankingParams(params, 1, input));
    return result.data.entries.slice(0, 3) as RankingPageEntry[];
  }

  const personParams = rankingParams(params, 1, input);
  personParams.set("paged", "1");
  const result = await loadRankingsWithDiagnostics(personParams);
  return (result.data.entries ?? []).slice(0, 3) as RankingPageEntry[];
}

export async function loadTopRankingResultLabels(
  params: URLSearchParams,
  input: RankingDocumentTitleInput,
): Promise<string[]> {
  try {
    const entries = await loadTopRankingEntries(params, input);
    return entries.map((entry) => entryLabel(entry, input));
  } catch (error) {
    console.warn("Ranking metadata top-result lookup failed", error);
    return [];
  }
}
