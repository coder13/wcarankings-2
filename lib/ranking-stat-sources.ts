export type RankingStatSourceDefinition = {
  sourceId: string;
  entityType: "person" | "country";
  metrics: readonly string[];
  supportedFilters: {
    event: boolean;
    resultType: boolean;
    regionScopes: readonly ("world" | "continent" | "country")[];
    year: boolean;
    genders: boolean;
  };
  feedEligibility: {
    home: boolean;
    person: boolean;
  };
  paths: {
    page: string;
    api: string;
  };
};

export const RANKING_STAT_SOURCES = [
  {
    sourceId: "person-pr-streak",
    entityType: "person",
    metrics: ["pr-streak"],
    supportedFilters: {
      event: false,
      resultType: false,
      regionScopes: ["world", "continent", "country"],
      year: true,
      genders: true,
    },
    feedEligibility: { home: true, person: true },
    paths: {
      page: "/persons/pr-streak",
      api: "/api/rankings/people/pr-streak",
    },
  },
] as const satisfies readonly RankingStatSourceDefinition[];

export function rankingStatSource(sourceId: string) {
  const source = RANKING_STAT_SOURCES.find(
    (candidate) => candidate.sourceId === sourceId,
  );
  if (!source) throw new Error(`Unknown ranking stat source: ${sourceId}`);
  return source;
}
