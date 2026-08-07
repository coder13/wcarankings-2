import { query } from "@/db";

export const dynamic = "force-dynamic";

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
  city_name: string | null;
};

export async function GET() {
  const { rows } = await query<SourceRow>(
    `SELECT source.source_name, source.competition_id, source.remote_competition_id, source.competition_year, source.enabled, source.poll_seconds, source.next_poll_at, source.last_success_at, source.last_error, source.snapshot_hash, competition.name, competition.city_name FROM provisional_live_result_sources source LEFT JOIN competitions competition ON competition.id = source.competition_id ORDER BY source.enabled DESC, source.next_poll_at, source.competition_id`,
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
  const { rows } = await query<{ id: string; year: number }>(
    `SELECT id, year FROM competitions WHERE id IN (${ids.map(() => "?").join(",")})`,
    ids,
  );
  if (rows.length !== ids.length)
    return Response.json(
      { error: "One or more competition IDs are unknown." },
      { status: 400 },
    );
  for (const competition of rows)
    await query(
      `INSERT INTO provisional_live_result_sources (source_name, competition_id, remote_competition_id, competition_year, enabled, next_poll_at) VALUES ('wca-live', ?, ?, ?, 1, CURRENT_TIMESTAMP(6)) ON DUPLICATE KEY UPDATE enabled = 1, next_poll_at = CURRENT_TIMESTAMP(6), last_error = NULL`,
      [competition.id, competition.id, competition.year],
    );
  return Response.json(
    { scheduled: rows.map((row) => row.id) },
    { status: 202 },
  );
}
