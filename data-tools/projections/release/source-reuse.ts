import { compareSourceManifests, type SourceManifest } from "./source-manifest.ts";

export interface SourceReusePlan {
  allTimeRequired: true;
  currentYear: number;
  dirtyYears: number[];
  reusedYears: number[];
  dirtyCompetitionIds: string[];
  reasons: string[];
}

export function sourceReusePlan(
  current: SourceManifest,
  previous: SourceManifest | undefined,
  currentYear: number,
): SourceReusePlan {
  const comparison = compareSourceManifests(current, previous, currentYear);
  const allYears = new Set(Object.keys(current.years).map(Number));
  return {
    allTimeRequired: true,
    currentYear,
    dirtyYears: comparison.dirtyYears,
    reusedYears: [...allYears]
      .filter((year) => !comparison.dirtyYears.includes(year))
      .sort((a, b) => a - b),
    dirtyCompetitionIds: comparison.dirtyCompetitionIds,
    reasons: comparison.reasons,
  };
}
