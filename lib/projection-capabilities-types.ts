export type ProjectionCapabilities = {
  generationId: string | null;
  exportId: string | null;
  core: boolean;
  sumOfRanks: boolean;
  yearlyPersonRankings: boolean;
};

export const DEFAULT_PROJECTION_CAPABILITIES: ProjectionCapabilities = {
  generationId: null,
  exportId: null,
  core: true,
  sumOfRanks: true,
  yearlyPersonRankings: true,
};

export const UNAVAILABLE_PROJECTION_CAPABILITIES: ProjectionCapabilities = {
  generationId: null,
  exportId: null,
  core: false,
  sumOfRanks: false,
  yearlyPersonRankings: false,
};
