"use client";

import { AppHeader } from "../AppHeader/AppHeader";
import { TextDropdown } from "../Dropdown/TextDropdown";
import {
  CITY_RANKING_OPTIONS,
  COMPETITION_RANKING_OPTIONS,
} from "./helpers/rankingModes";
import { useRankingsExplorer } from "./RankingsExplorerContext";

export function RankingsExplorerHeader() {
  const {
    config: { source, options: { showSubjectSwitch } },
    filters,
    interactions: { filterActions: actions },
  } = useRankingsExplorer();
  const {
    subject,
    competitionRanking,
    cityRanking,
  } = filters;
  let headerSubject;
  if (source) headerSubject = "lists" as const;
  else if (showSubjectSwitch) headerSubject = subject;
  let changeHeaderSubject;
  if (source) changeHeaderSubject = actions.leaveList;
  else if (showSubjectSwitch) changeHeaderSubject = actions.changeSubject;

  let contextualControl = null;
  if (!source && showSubjectSwitch && subject === "competitions") {
    contextualControl = (
      <TextDropdown
        options={COMPETITION_RANKING_OPTIONS}
        value={competitionRanking}
        onChange={actions.changeCompetitionRanking}
        ariaLabel="Competition ranking"
        className="competitionRankingDropdown"
      />
    );
  } else if (!source && showSubjectSwitch && subject === "cities") {
    contextualControl = (
      <TextDropdown
        options={CITY_RANKING_OPTIONS}
        value={cityRanking}
        onChange={(value) => actions.changeCityRanking(value as typeof cityRanking)}
        ariaLabel="City ranking"
        className="competitionRankingDropdown"
      />
    );
  }

  return (
    <AppHeader
      subject={headerSubject}
      onSubjectChange={changeHeaderSubject}
    >
      {source
        ? <span className="listRankingName">{source.listName}</span>
        : contextualControl}
    </AppHeader>
  );
}
