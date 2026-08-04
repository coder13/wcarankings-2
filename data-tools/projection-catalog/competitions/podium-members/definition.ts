import type { ProjectionJob } from "../../types.ts";

export const competitionPodiumMembersJob = {
  id: "competition-podium-members",
  dependencies: [],
  sqlFiles: ["competitions/podium-members/competition_podium_members.sql"],
  tables: ["competition_podium_members"],
  releaseGroup: "competition-rankings",
  releaseOrder: 3,
  releaseSchemaVersion: 1,
  estimatedDurationMs: 30_000,
  enabledByDefault: true,
  subject: "competitions",
  stat: "podium-members",
} as const satisfies ProjectionJob;
