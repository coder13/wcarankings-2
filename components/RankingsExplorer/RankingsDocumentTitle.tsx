"use client";

import { useEffect } from "react";
import { formatRankingDocumentTitle } from "@/lib/ranking-document-title";
import { useRankingsExplorer } from "./RankingsExplorerContext";

export function RankingsDocumentTitle() {
  const {
    config: { source },
    filters,
  } = useRankingsExplorer();

  useEffect(() => {
    document.title = formatRankingDocumentTitle({
      subject: filters.subject,
      eventId: filters.eventId,
      rankingType: filters.rankingType,
      competitionRanking: filters.competitionRanking,
      cityRanking: filters.cityRanking,
      year: filters.year,
      personCompetitionRanking: filters.personCompetitionRanking,
      listName: source?.listName,
    });
  }, [
    filters.cityRanking,
    filters.competitionRanking,
    filters.eventId,
    filters.personCompetitionRanking,
    filters.rankingType,
    filters.subject,
    filters.year,
    source?.listName,
  ]);

  return null;
}
