export type ProjectionFeatureSwitch = {
  generationId: string | null;
  exportId: string | null;
  core: boolean;
  resultRankings: boolean;
  competitionRankings: boolean;
  personActivityRankings: boolean;
  personCompetitionRankings: boolean;
  personMedalRankings: boolean;
  personPrStreakRankings: boolean;
  cityEventStats: boolean;
  sumOfRanks: boolean;
  yearlyPersonRankings: boolean;
};

export const DEFAULT_PROJECTION_FEATURE_SWITCH: ProjectionFeatureSwitch = {
  generationId: null,
  exportId: null,
  core: true,
  resultRankings: true,
  competitionRankings: true,
  personActivityRankings: true,
  personCompetitionRankings: true,
  personMedalRankings: true,
  personPrStreakRankings: true,
  cityEventStats: true,
  sumOfRanks: true,
  yearlyPersonRankings: true,
};

export const UNAVAILABLE_PROJECTION_FEATURE_SWITCH: ProjectionFeatureSwitch = {
  generationId: null,
  exportId: null,
  core: false,
  resultRankings: false,
  competitionRankings: false,
  personActivityRankings: false,
  personCompetitionRankings: false,
  personMedalRankings: false,
  personPrStreakRankings: false,
  cityEventStats: false,
  sumOfRanks: false,
  yearlyPersonRankings: false,
};
