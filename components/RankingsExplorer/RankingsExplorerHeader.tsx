"use client";

import { AppHeader } from "../AppHeader/AppHeader";
import { TextDropdown } from "../Dropdown/TextDropdown";
import { useProjectionFeatureSwitch } from "../ProjectionFeatureSwitchProvider";
import {
  CITY_RANKING_OPTIONS,
  COMPETITION_RANKING_OPTIONS,
} from "./helpers/rankingModes";
import { useRankingsExplorer } from "./RankingsExplorerContext";

const PERSON_RANKING_OPTIONS = [
  { value: "rankings", label: "Rankings" },
  { value: "medals", label: "Medals" },
  { value: "competitions", label: "Competitions" },
] as const;

export function RankingsExplorerHeader() {
  const {
    config: { source, options: { showSubjectSwitch } },
    filters,
    filterActions: actions,
  } = useRankingsExplorer();
  const featureSwitch = useProjectionFeatureSwitch();
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
  if (!source && showSubjectSwitch && subject === "people") {
    const personRankingOptions = PERSON_RANKING_OPTIONS.filter((option) => {
      if (option.value === "medals") return featureSwitch.personMedalRankings;
      if (option.value === "competitions")
        return featureSwitch.personCompetitionRankings;
      return true;
    });
    let personRankingValue = "rankings";
    if (filters.personCompetitionRanking) personRankingValue = "competitions";
    else if (filters.personMedalRanking) personRankingValue = "medals";
    contextualControl = (
      <TextDropdown
        options={personRankingOptions}
        value={personRankingValue}
        onChange={(value) => {
          if (value === "competitions") {
            actions.changePersonCompetitionRanking(true);
          } else if (value === "medals") {
            actions.changePersonMedalRanking(true);
          } else if (filters.personCompetitionRanking) {
            actions.changePersonCompetitionRanking(false);
          } else {
            actions.changePersonMedalRanking(false);
          }
        }}
        ariaLabel="Person ranking"
        className="personRankingDropdown"
      />
    );
  } else if (!source && showSubjectSwitch && subject === "competitions") {
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
