export type ProjectionFeatureSwitch = {
  generationId: string | null;
  exportId: string | null;
  core: boolean;
  resultRankings: boolean;
  competitionRankings: boolean;
  personCompetitionRankings: boolean;
  personMedalRankings: boolean;
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
  personCompetitionRankings: true,
  personMedalRankings: true,
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
  personCompetitionRankings: false,
  personMedalRankings: false,
  cityEventStats: false,
  sumOfRanks: false,
  yearlyPersonRankings: false,
};
