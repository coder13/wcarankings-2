"use client";

import { useState } from "react";
import type { ExplorerSubject } from "../ExplorerSubjectSwitch/ExplorerSubjectSwitch";
import type { RegionSelection } from "./types";
import type { CityRanking, CompetitionRanking } from "./helpers/rankingModes";

export function useRankingsExplorerState(input: {
  eventId: string;
  rankingType: "single" | "average";
  regionSelection: RegionSelection;
  subject: ExplorerSubject;
  competitionRanking: CompetitionRanking;
  cityRanking: CityRanking;
  latitudeHemisphere: "north" | "south";
}) {
  const [eventId, setEventId] = useState(input.eventId);
  const [rankingType, setRankingType] = useState(input.rankingType);
  const [regionSelection, setRegionSelection] = useState(input.regionSelection);
  const [subject, setSubject] = useState<ExplorerSubject>(input.subject);
  const [competitionRanking, setCompetitionRanking] = useState<CompetitionRanking>(input.competitionRanking);
  const [cityRanking, setCityRanking] = useState<CityRanking>(input.cityRanking);
  const [latitudeHemisphere, setLatitudeHemisphere] = useState<"north" | "south">(input.latitudeHemisphere);
  const [listAddOpen, setListAddOpen] = useState(false);
  const [memberSelectionMode, setMemberSelectionMode] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());

  return {
    eventId, setEventId, rankingType, setRankingType, regionSelection, setRegionSelection,
    subject, setSubject, competitionRanking, setCompetitionRanking,
    cityRanking, setCityRanking,
    latitudeHemisphere, setLatitudeHemisphere, listAddOpen, setListAddOpen,
    memberSelectionMode, setMemberSelectionMode, selectedMemberIds, setSelectedMemberIds,
  };
}
