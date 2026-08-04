import type { ProjectionJob } from "../../types.ts";

export const personEventRankingsJobs = [
  {
    id: "person-event-rankings",
    dependencies: ["result-facts"],
    sqlFiles: ["people/event-rankings/person_event_rankings.sql"],
    tables: ["person_event_rankings"],
    releaseGroup: "person-event-rankings",
    releaseSchemaVersion: 1,
    estimatedDurationMs: 90_000,
    publish: false,
    subject: "people",
    stat: "event-rankings",
  },
  {
    id: "person-ranking-counts",
    dependencies: ["person-event-rankings"],
    sqlFiles: ["people/event-rankings/projection_counts.sql"],
    tables: ["person_ranking_counts"],
    releaseGroup: "person-event-rankings",
    releaseSchemaVersion: 1,
    estimatedDurationMs: 15_000,
    publish: false,
    subject: "people",
    stat: "ranking-counts",
  },
] as const satisfies readonly ProjectionJob[];
