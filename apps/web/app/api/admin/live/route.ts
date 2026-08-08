import { query } from "@/db";
import { rejectNonAdmin } from "@/lib/admin-access";

export const dynamic = "force-dynamic";

const activeToday = `CURRENT_DATE() BETWEEN
  STR_TO_DATE(CONCAT(competition.year, '-', competition.month, '-', competition.day), '%Y-%c-%e')
  AND STR_TO_DATE(CONCAT(competition.end_year, '-', competition.end_month, '-', competition.end_day), '%Y-%c-%e')`;

type SourceRow = {
  source_name: string;
  competition_id: string;
  remote_competition_id: string;
  competition_year: number;
  enabled: number;
  scoretaking_software: string | null;
  provider_status: "supported" | "unsupported" | "unknown";
  provider_message: string | null;
  result_count: number;
  person_count: number;
  registered_person_count: number | null;
  leased_until: string | null;
  last_success_at: string | null;
  last_imported_at: string | null;
  last_error: string | null;
  snapshot_hash: string | null;
  name: string | null;
  country_iso2: string;
  start_date: string;
  end_date: string;
};

type SummaryRow = {
  competition_count: number;
  country_count: number;
  person_count: number;
};

type SchedulerRow = {
  poll_seconds: number;
  next_import_at: string;
};

export async function GET(request: Request) {
  const rejection = await rejectNonAdmin(request);
  if (rejection) return rejection;
  const visibleSource = `source.enabled = 1 OR NOT EXISTS (
    SELECT 1 FROM provisional_live_result_sources enabled_source
    WHERE enabled_source.competition_id = source.competition_id
      AND enabled_source.enabled = 1
  )`;
  const { rows } = await query<SourceRow>(
    `SELECT source.source_name, source.competition_id, source.remote_competition_id, source.competition_year, source.enabled, source.scoretaking_software, source.provider_status, source.provider_message, source.registered_person_count, COALESCE(counts.result_count, 0) AS result_count, COALESCE(counts.person_count, 0) AS person_count, IF(source.leased_until IS NULL, NULL, CONCAT(DATE_FORMAT(source.leased_until, '%Y-%m-%dT%H:%i:%s.%f'), 'Z')) AS leased_until, IF(source.last_success_at IS NULL, NULL, CONCAT(DATE_FORMAT(source.last_success_at, '%Y-%m-%dT%H:%i:%s.%f'), 'Z')) AS last_success_at, IF(source.last_imported_at IS NULL, NULL, CONCAT(DATE_FORMAT(source.last_imported_at, '%Y-%m-%dT%H:%i:%s.%f'), 'Z')) AS last_imported_at, source.last_error, source.snapshot_hash, competition.name, COALESCE(country.iso2, '') AS country_iso2, CONCAT(LPAD(competition.year, 4, '0'), '-', LPAD(competition.month, 2, '0'), '-', LPAD(competition.day, 2, '0')) AS start_date, CONCAT(LPAD(competition.end_year, 4, '0'), '-', LPAD(competition.end_month, 2, '0'), '-', LPAD(competition.end_day, 2, '0')) AS end_date FROM provisional_live_result_sources source JOIN competitions competition ON competition.id = source.competition_id LEFT JOIN countries country ON country.id = competition.country_id LEFT JOIN (SELECT source_name, competition_id, COUNT(*) AS result_count, COUNT(DISTINCT person_id) AS person_count FROM provisional_live_results GROUP BY source_name, competition_id) counts ON counts.source_name = source.source_name AND counts.competition_id = source.competition_id WHERE ${activeToday} AND (${visibleSource}) ORDER BY source.competition_id`,
  );
  const { rows: schedulerRows } = await query<SchedulerRow>(
    `SELECT poll_seconds,
       CONCAT(DATE_FORMAT(next_import_at, '%Y-%m-%dT%H:%i:%s.%f'), 'Z') AS next_import_at
     FROM live_results_settings WHERE id = 1`,
  );
  const { rows: summaryRows } = await query<SummaryRow>(
    `SELECT COUNT(DISTINCT source.competition_id) AS competition_count,
       COUNT(DISTINCT live.country_iso2) AS country_count,
       COUNT(DISTINCT live.person_id) AS person_count
     FROM provisional_live_result_sources source
     JOIN competitions competition ON competition.id = source.competition_id
     LEFT JOIN provisional_live_results live
       ON live.source_name = source.source_name
      AND live.competition_id = source.competition_id
     WHERE ${activeToday} AND (${visibleSource})`,
  );
  const summary = summaryRows[0] ?? {
    competition_count: 0,
    country_count: 0,
    person_count: 0,
  };
  return Response.json(
    {
      scheduler: {
        discoveryCron: "0 0 * * * UTC",
        pollSeconds: Number(schedulerRows[0]?.poll_seconds ?? 3600),
        nextImportAt: schedulerRows[0]?.next_import_at ?? null,
      },
      summary,
      sources: rows,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const rejection = await rejectNonAdmin(request);
  if (rejection) return rejection;
  const body = (await request.json()) as { competitionIds?: unknown };
  const ids = Array.isArray(body.competitionIds)
    ? [
        ...new Set(
          body.competitionIds.filter(
            (id): id is string =>
              typeof id === "string" && /^[A-Za-z0-9]+$/.test(id),
          ),
        ),
      ]
    : [];
  if (ids.length === 0 || ids.length > 100)
    return Response.json(
      { error: "Select from 1 through 100 competition IDs." },
      { status: 400 },
    );
  const { rows } = await query<{
    competition_id: string;
    provider_message: string | null;
    provider_status: "supported" | "unsupported" | "unknown";
    source_name: string;
  }>(
    `SELECT source.source_name, source.competition_id, source.provider_status, source.provider_message FROM provisional_live_result_sources source JOIN competitions competition ON competition.id = source.competition_id WHERE ${activeToday} AND source.competition_id IN (${ids.map(() => "?").join(",")}) AND (source.enabled = 1 OR (source.provider_status = 'unknown' AND source.provider_message = 'WCA scoretaking software is unavailable.'))`,
    ids,
  );
  if (rows.length !== ids.length)
    return Response.json(
      { error: "Select only tracked competitions that are active today." },
      { status: 400 },
    );
  for (const competition of rows)
    await query(
      `UPDATE provisional_live_result_sources SET enabled = 1,
       provider_status = 'supported', provider_message = NULL,
       last_error = NULL
       WHERE source_name = ? AND competition_id = ?`,
      [competition.source_name, competition.competition_id],
    );
  await query(
    "UPDATE live_results_settings SET next_import_at = CURRENT_TIMESTAMP(6) WHERE id = 1",
  );
  return Response.json(
    { scheduled: rows.map((row) => row.competition_id) },
    { status: 202 },
  );
}
