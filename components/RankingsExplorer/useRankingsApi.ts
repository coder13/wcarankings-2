"use client";

import { useMemo } from "react";
import type { GenderFilter } from "@/lib/wca";
import type { MedalRankingType } from "@/lib/medal-rankings";
import type { ExplorerSubject } from "../ExplorerSubjectSwitch/ExplorerSubjectSwitch";
import type {
  CityRanking,
  CompetitionRanking,
  RankingResource,
} from "./helpers/rankingModes";
import {
  rankingWindowQueryKey,
  seedSavedListVersionWindow,
  useRankingsQueryApi,
} from "./rankingsQueries";
import type {
  InitialRankingData,
  RankingSource,
  RegionSelection,
} from "./types";

type RankingsApiFilters = {
  subject: ExplorerSubject;
  competitionRanking: CompetitionRanking;
  cityRanking: CityRanking;
  personCompetitionRanking: boolean;
  personMedalRanking: boolean;
  medalType: MedalRankingType;
  year: number | null;
  latitudeHemisphere: "north" | "south";
  eventId: string;
  rankingType: "single" | "average";
  gender: readonly GenderFilter[];
  regionSelection: RegionSelection;
};

function rankingResource({
  subject,
  competitionRanking,
  cityRanking,
  personCompetitionRanking,
  personMedalRanking,
  latitudeHemisphere,
}: RankingsApiFilters): RankingResource {
  if (subject === "results") return "results";
  if (subject === "cities") return `city-${cityRanking}`;
  if (subject !== "competitions") {
    if (personCompetitionRanking) return "person-competition-count";
    if (personMedalRanking) return "person-medal-rankings";
    return "people";
  }
  if (competitionRanking === "latitude")
    return `latitude-${latitudeHemisphere}`;
  if (competitionRanking === "competitor-count") return "competitor-count";
  return competitionRanking === "podiums" ? "podiums" : "competitions";
}

export function useRankingsApi({
  filters,
  source,
  initialData,
}: {
  filters: RankingsApiFilters;
  source?: RankingSource;
  initialData?: InitialRankingData;
}) {
  const { eventId, rankingType, regionSelection, gender, year, medalType } =
    filters;
  const resource = rankingResource(filters);
  const queryFilters = useMemo(
    () => ({
      eventId,
      rankingType,
      regionSelection,
      resource,
      source,
      gender,
      year,
      medalType,
    }),
    [
      eventId,
      gender,
      medalType,
      rankingType,
      regionSelection,
      resource,
      source,
      year,
    ],
  );
  seedSavedListVersionWindow(queryFilters, initialData);

  const datasetKey = JSON.stringify(rankingWindowQueryKey(queryFilters));
  const requests = useRankingsQueryApi(queryFilters);
  const range = useMemo(
    () => ({
      cacheKey: datasetKey,
      fetchRange: (
        request: { start: number; count: number },
        signal: AbortSignal,
      ) => requests.getRange(request.start, request.count, signal),
    }),
    [datasetKey, requests],
  );

  return useMemo(
    () => ({
      datasetKey,
      range,
      search: requests.searchRankings,
      locate: requests.locateRanking,
    }),
    [datasetKey, range, requests],
  );
}

export type RankingsApi = ReturnType<typeof useRankingsApi>;
