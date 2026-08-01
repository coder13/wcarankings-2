"use client";

import { useMemo } from "react";
import type { GenderFilter } from "@/lib/wca";
import type { ExplorerSubject } from "../ExplorerSubjectSwitch/ExplorerSubjectSwitch";
import type { CityRanking, CompetitionRanking, RankingResource } from "./helpers/rankingModes";
import {
  rankingWindowQueryKey,
  useRankingsQueryApi,
} from "./rankingsQueries";
import type { RankingSource, RegionSelection } from "./types";

type DataSourceFilters = {
  subject: ExplorerSubject;
  competitionRanking: CompetitionRanking;
  cityRanking: CityRanking;
  year: number | null;
  latitudeHemisphere: "north" | "south";
  eventId: string;
  rankingType: "single" | "average";
  gender: readonly GenderFilter[];
  regionSelection: RegionSelection;
};

function rankingResource(
  subject: ExplorerSubject,
  competitionRanking: CompetitionRanking,
  cityRanking: CityRanking,
  latitudeHemisphere: "north" | "south",
): RankingResource {
  if (subject === "results") return "results";
  if (subject === "cities") return `city-${cityRanking}`;
  if (subject !== "competitions") return "people";
  if (competitionRanking === "latitude") return `latitude-${latitudeHemisphere}`;
  if (competitionRanking === "competitor-count") return "competitor-count";
  return competitionRanking === "podiums" ? "podiums" : "competitions";
}

export function useRankingDataSource({
  filters,
  source,
}: {
  filters: DataSourceFilters;
  source?: RankingSource;
}) {
  const {
    subject,
    competitionRanking,
    cityRanking,
    year,
    latitudeHemisphere,
    eventId,
    rankingType,
    gender,
    regionSelection,
  } = filters;
  const resource = rankingResource(
    subject,
    competitionRanking,
    cityRanking,
    latitudeHemisphere,
  );
  const queryFilters = useMemo(
    () => ({
      eventId,
      rankingType,
      regionSelection,
      resource,
      source,
      gender,
      year,
    }),
    [
      eventId,
      gender,
      rankingType,
      regionSelection,
      resource,
      source,
      year,
    ],
  );
  const listKey = JSON.stringify(rankingWindowQueryKey(queryFilters));
  const requests = useRankingsQueryApi(queryFilters);

  return { listKey, queryFilters, requests };
}

export type RankingDataSource = ReturnType<typeof useRankingDataSource>;
