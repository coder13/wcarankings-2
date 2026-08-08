"use client";

import { AppHeader } from "../AppHeader/AppHeader";
import { TextDropdown } from "../Dropdown/TextDropdown";
import { useProjectionFeatureSwitch } from "../ProjectionFeatureSwitchProvider";
import { ShareButton, shouldShowListShare } from "../ShareButton/ShareButton";
import {
  CITY_RANKING_OPTIONS,
  COMPETITION_RANKING_OPTIONS,
} from "./helpers/rankingModes";
import { useRankingsExplorer } from "./RankingsExplorerContext";

const PERSON_RANKING_OPTIONS = [
  { value: "rankings", label: "Rankings" },
  { value: "competitions", label: "Competition count" },
  { value: "countries", label: "Countries" },
  { value: "rounds", label: "Rounds" },
  { value: "solves", label: "Solves" },
  { value: "medals", label: "Medals" },
  { value: "pr-streak", label: "PR Streak" },
] as const;

export function RankingsExplorerHeader() {
  const {
    config: {
      source,
      options: { showSubjectSwitch },
    },
    filters,
    filterActions: actions,
    search,
  } = useRankingsExplorer();
  const featureSwitch = useProjectionFeatureSwitch();
  const { subject, competitionRanking, cityRanking } = filters;
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
      if (option.value === "pr-streak")
        return featureSwitch.personPrStreakRankings;
      if (option.value !== "rankings")
        return featureSwitch.personActivityRankings;
      return true;
    });
    let personRankingValue = "rankings";
    if (filters.personMedalRanking) personRankingValue = "medals";
    else if (filters.personActivityRanking)
      personRankingValue = filters.personActivityMetric;
    else if (filters.personPrStreakRanking) personRankingValue = "pr-streak";
    contextualControl = (
      <TextDropdown
        options={personRankingOptions}
        value={personRankingValue}
        onChange={(value) => {
          if (value === "medals") {
            actions.changePersonMedalRanking(true);
          } else if (value === "pr-streak") {
            actions.changePersonPrStreakRanking(true);
          } else if (value === "rankings") {
            if (filters.personMedalRanking)
              actions.changePersonMedalRanking(false);
            else if (filters.personActivityRanking)
              actions.changePersonActivityRanking(false);
            else if (filters.personPrStreakRanking)
              actions.changePersonPrStreakRanking(false);
            else actions.changePersonCompetitionRanking(false);
          } else {
            actions.changePersonActivityRanking(
              true,
              value as typeof filters.personActivityMetric,
            );
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
        onChange={(value) =>
          actions.changeCityRanking(value as typeof cityRanking)
        }
        ariaLabel="City ranking"
        className="competitionRankingDropdown"
      />
    );
  }

  const showShare = shouldShowListShare({
    hasList: Boolean(source),
    searchOpen: search.state.open,
    searchQuery: search.state.query,
    regexSearch: search.state.regexSearch,
  });

  return (
    <AppHeader
      subject={headerSubject}
      onSubjectChange={changeHeaderSubject}
      actions={
        showShare && source ? (
          <ShareButton title={source.listName} />
        ) : undefined
      }
    >
      {source ? (
        <span className="listRankingName">{source.listName}</span>
      ) : (
        contextualControl
      )}
    </AppHeader>
  );
}
