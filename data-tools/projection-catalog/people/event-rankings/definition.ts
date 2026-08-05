import type { ProjectionJob } from "../../types.ts";

export const personEventRankingsJobs = [
  {
    id: "person-event-rankings",
    dependencies: ["result-facts"],
    sqlFiles: ["people/event-rankings/person_event_rankings.sql"],
    tables: ["person_event_rankings"],
    releaseGroup: "person-event-rankings",
    releaseOrder: 3,
    releaseSchemaVersion: 2,
    estimatedDurationMs: 90_000,
    enabledByDefault: true,
    subject: "people",
    stat: "event-rankings",
  },
] as const satisfies readonly ProjectionJob[];
