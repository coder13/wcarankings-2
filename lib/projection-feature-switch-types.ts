export type ProjectionFeatureSwitch = {
  generationId: string | null;
  exportId: string | null;
  core: boolean;
  sumOfRanks: boolean;
  yearlyPersonRankings: boolean;
};

export const DEFAULT_PROJECTION_FEATURE_SWITCH: ProjectionFeatureSwitch = {
  generationId: null,
  exportId: null,
  core: true,
  sumOfRanks: true,
  yearlyPersonRankings: true,
};

export const UNAVAILABLE_PROJECTION_FEATURE_SWITCH: ProjectionFeatureSwitch = {
  generationId: null,
  exportId: null,
  core: false,
  sumOfRanks: false,
  yearlyPersonRankings: false,
};
