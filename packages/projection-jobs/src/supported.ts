import type { ProjectionJob } from "./queue.ts";

export function supportsProjectionJob(job: ProjectionJob): boolean {
  if (job.kind !== "projection-rebuild") return false;
  const { payload } = job;
  if (
    job.key === `competition-stats:${payload.competitionId}` &&
    Boolean(payload.competitionId) &&
    Boolean(payload.year)
  )
    return true;
  if (
    /^medal-rankings:[A-Za-z0-9]*:(world|continent|country):[A-Za-z0-9_ -]*$/.test(
      job.key,
    ) &&
    Boolean(payload.eventId) &&
    ["world", "continent", "country"].includes(payload.scope ?? "") &&
    payload.regionId !== undefined
  )
    return true;
  if (
    /^medal-scores:\d{4}:\d+$/.test(job.key) &&
    Boolean(payload.personIds) &&
    Boolean(payload.year)
  )
    return true;
  if (
    job.key === `city-stats:${payload.competitionId}:${payload.eventId}` &&
    Boolean(payload.competitionId) &&
    Boolean(payload.eventId)
  )
    return true;
  if (
    job.key ===
      `competition-event-stats:${payload.competitionId}:${payload.eventId}` &&
    Boolean(payload.competitionId) &&
    Boolean(payload.eventId) &&
    Boolean(payload.year)
  )
    return true;
  if (
    /^person-stats:\d{4}:\d+$/.test(job.key) &&
    Boolean(payload.personIds) &&
    Boolean(payload.year)
  )
    return true;
  if (
    /^person-stat-rankings:\d+:(country-count|round-count|solve-count):(world|continent|country):[A-Za-z0-9_ -]*:(all|m|f|o)$/.test(
      job.key,
    ) &&
    ["country-count", "round-count", "solve-count"].includes(
      payload.metric ?? "",
    ) &&
    ["world", "continent", "country"].includes(payload.scope ?? "") &&
    ["all", "m", "f", "o"].includes(payload.gender ?? "") &&
    payload.periodYear !== undefined &&
    payload.regionId !== undefined
  )
    return (
      job.key ===
      `person-stat-rankings:${payload.periodYear}:${payload.metric}:${payload.scope}:${payload.regionId}:${payload.gender}`
    );
  if (
    /^person-event-bests:\d{4}:\d+$/.test(job.key) &&
    Boolean(payload.personIds) &&
    Boolean(payload.year)
  )
    return true;
  if (
    /^competition-rankings:(world|continent|country):[A-Za-z0-9_ -]*:(all|m|f|o)$/.test(
      job.key,
    ) &&
    ["world", "continent", "country"].includes(payload.scope ?? "") &&
    payload.regionId !== undefined &&
    (payload.scope === "world"
      ? payload.regionId === ""
      : Boolean(payload.regionId)) &&
    ["all", "m", "f", "o"].includes(payload.gender ?? "")
  )
    return (
      job.key ===
      `competition-rankings:${payload.scope}:${payload.regionId}:${payload.gender}`
    );
  if (
    /^person-event-rankings:[A-Za-z0-9]+:(single|average)$/.test(
      job.key,
    ) &&
    Boolean(payload.eventId) &&
    (payload.resultType === "single" || payload.resultType === "average")
  )
    return (
      job.key ===
      `person-event-rankings:${payload.eventId}:${payload.resultType}`
    );
  if (
    /^sum-of-ranks:(continent|country):[A-Za-z0-9_ -]+$/.test(job.key) &&
    (payload.scope === "continent" || payload.scope === "country") &&
    Boolean(payload.regionId)
  )
    return (
      job.key === `sum-of-ranks:${payload.scope}:${payload.regionId}` &&
      (payload.scope !== "country"
        ? payload.countryIds !== undefined
        : Boolean(payload.continentId))
    );
  return (
    /^yearly-rankings:\d{4}:[A-Za-z0-9]+:(single|average)$/.test(job.key) &&
    Boolean(payload.eventId) &&
    (payload.resultType === "single" || payload.resultType === "average") &&
    Boolean(payload.year)
  );
}
