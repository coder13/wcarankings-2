import { query } from "@/db";

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
  poll_seconds: number;
  next_poll_at: string;
  last_success_at: string | null;
  last_error: string | null;
  snapshot_hash: string | null;
  name: string | null;
  start_date: string;
  end_date: string;
};

export async function GET() {
  const { rows } = await query<SourceRow>(
    `SELECT source.source_name, source.competition_id, source.remote_competition_id, source.competition_year, source.enabled, source.poll_seconds, CONCAT(DATE_FORMAT(source.next_poll_at, '%Y-%m-%dT%H:%i:%s.%f'), 'Z') AS next_poll_at, IF(source.last_success_at IS NULL, NULL, CONCAT(DATE_FORMAT(source.last_success_at, '%Y-%m-%dT%H:%i:%s.%f'), 'Z')) AS last_success_at, source.last_error, source.snapshot_hash, competition.name, CONCAT(LPAD(competition.year, 4, '0'), '-', LPAD(competition.month, 2, '0'), '-', LPAD(competition.day, 2, '0')) AS start_date, CONCAT(LPAD(competition.end_year, 4, '0'), '-', LPAD(competition.end_month, 2, '0'), '-', LPAD(competition.end_day, 2, '0')) AS end_date FROM provisional_live_result_sources source JOIN competitions competition ON competition.id = source.competition_id WHERE source.enabled = 1 AND ${activeToday} ORDER BY source.competition_id`,
  );
  return Response.json(
    {
      scheduler: {
        discoveryCron: "0 0 * * * UTC",
        pollerIntervalMs:
          Number(process.env.PROVISIONAL_RANKING_WORKER_POLL_MS) || 2_000,
      },
      sources: rows,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
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
  const { rows } = await query<{ competition_id: string }>(
    `SELECT source.competition_id FROM provisional_live_result_sources source JOIN competitions competition ON competition.id = source.competition_id WHERE source.enabled = 1 AND ${activeToday} AND source.competition_id IN (${ids.map(() => "?").join(",")})`,
    ids,
  );
  if (rows.length !== ids.length)
    return Response.json(
      { error: "Select only tracked competitions that are active today." },
      { status: 400 },
    );
  for (const competition of rows)
    await query(
      `UPDATE provisional_live_result_sources SET next_poll_at = CURRENT_TIMESTAMP(6), last_error = NULL WHERE competition_id = ?`,
      [competition.competition_id],
    );
  return Response.json(
    { scheduled: rows.map((row) => row.competition_id) },
    { status: 202 },
  );
}
