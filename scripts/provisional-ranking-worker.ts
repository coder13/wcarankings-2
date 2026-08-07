import { randomUUID } from "node:crypto";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";
import { databaseOptions } from "./lib/database.ts";
import { fetchLiveResults, snapshotHash } from "./live-results/providers.ts";
import { provisionalCurrentYearRankingSql } from "./live-results/ranking-sql.ts";
import type { ClaimedProvisionalRankingJob, LiveResultsSourceRow } from "./live-results/types.ts";

const POLL_MS = Math.max(250, Number(process.env.PROVISIONAL_RANKING_WORKER_POLL_MS) || 2_000);
const LEASE_SECONDS = Math.max(30, Number(process.env.PROVISIONAL_RANKING_WORKER_LEASE_SECONDS) || 120);

async function claimSource(connection: Connection): Promise<LiveResultsSourceRow | null> {
  const token = randomUUID();
  await connection.beginTransaction();
  try {
    const [rows] = await connection.query<(LiveResultsSourceRow & RowDataPacket)[]>(
      `SELECT source_name, competition_id, remote_competition_id, competition_year
       FROM provisional_live_result_sources
       WHERE enabled = 1 AND next_poll_at <= CURRENT_TIMESTAMP(6)
         AND (leased_until IS NULL OR leased_until < CURRENT_TIMESTAMP(6))
       ORDER BY next_poll_at, competition_id LIMIT 1 FOR UPDATE SKIP LOCKED`,
    );
    const source = rows[0];
    if (!source) { await connection.commit(); return null; }
    await connection.query(
      `UPDATE provisional_live_result_sources
       SET lease_token = ?, leased_until = DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL ? SECOND)
       WHERE source_name = ? AND competition_id = ?`,
      [token, LEASE_SECONDS, source.source_name, source.competition_id],
    );
    await connection.commit();
    return { ...source, competition_year: Number(source.competition_year), lease_token: token };
  } catch (error) { await connection.rollback(); throw error; }
}

async function saveSnapshot(connection: Connection, source: LiveResultsSourceRow): Promise<void> {
  const snapshot = await fetchLiveResults(source.source_name, source.remote_competition_id);
  const hash = snapshotHash(snapshot);
  await connection.beginTransaction();
  try {
    const [state] = await connection.query<RowDataPacket[]>(
      `SELECT snapshot_hash FROM provisional_live_result_sources
       WHERE source_name = ? AND competition_id = ? AND lease_token = ? FOR UPDATE`,
      [source.source_name, source.competition_id, source.lease_token],
    );
    if (!state[0]) throw new Error("Live result source lease was lost.");
    if (state[0].snapshot_hash !== hash) {
      const [oldEvents] = await connection.query<RowDataPacket[]>(
        `SELECT DISTINCT event_id FROM provisional_live_results WHERE source_name = ? AND competition_id = ?`,
        [source.source_name, source.competition_id],
      );
      await connection.query(
        "DELETE FROM provisional_live_results WHERE source_name = ? AND competition_id = ?",
        [source.source_name, source.competition_id],
      );
      for (const result of snapshot.results) {
        await connection.query(
          `INSERT INTO provisional_live_results
           (source_name, competition_id, source_result_id, event_id, round_number, format_id, person_id, person_name, country_iso2, best, average, attempts_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [source.source_name, source.competition_id, result.sourceResultId, result.eventId, result.roundNumber,
            result.formatId, result.personId, result.personName, result.countryIso2, result.best, result.average,
            JSON.stringify(result.attempts)],
        );
      }
      const eventIds = new Set([...oldEvents.map((row) => String(row.event_id)), ...snapshot.results.map((result) => result.eventId)]);
      for (const eventId of eventIds) {
        await connection.query(
          `INSERT INTO provisional_current_year_ranking_rebuild_jobs (competition_year, event_id)
           VALUES (?, ?) ON DUPLICATE KEY UPDATE priority = GREATEST(priority, VALUES(priority)),
             available_at = LEAST(available_at, VALUES(available_at)), last_error = NULL`,
          [source.competition_year, eventId],
        );
      }
    }
    await connection.query(
      `UPDATE provisional_live_result_sources
       SET snapshot_hash = ?, last_success_at = CURRENT_TIMESTAMP(6), last_error = NULL,
         next_poll_at = DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL poll_seconds SECOND), lease_token = NULL, leased_until = NULL
       WHERE source_name = ? AND competition_id = ? AND lease_token = ?`,
      [hash, source.source_name, source.competition_id, source.lease_token],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    await connection.query(
      `UPDATE provisional_live_result_sources
       SET lease_token = NULL, leased_until = NULL,
         next_poll_at = DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL 60 SECOND), last_error = ?
       WHERE source_name = ? AND competition_id = ? AND lease_token = ?`,
      [String(error instanceof Error ? error.message : error).slice(0, 1000), source.source_name, source.competition_id, source.lease_token],
    );
    throw error;
  }
}

async function claimJob(connection: Connection): Promise<ClaimedProvisionalRankingJob | null> {
  const token = randomUUID();
  await connection.beginTransaction();
  try {
    const [rows] = await connection.query<(ClaimedProvisionalRankingJob & RowDataPacket)[]>(
      `SELECT competition_year, event_id FROM provisional_current_year_ranking_rebuild_jobs
       WHERE available_at <= CURRENT_TIMESTAMP(6) AND (leased_until IS NULL OR leased_until < CURRENT_TIMESTAMP(6))
       ORDER BY priority DESC, available_at, event_id LIMIT 1 FOR UPDATE SKIP LOCKED`,
    );
    const job = rows[0];
    if (!job) { await connection.commit(); return null; }
    await connection.query(
      `UPDATE provisional_current_year_ranking_rebuild_jobs
       SET lease_token = ?, leased_until = DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL ? SECOND), attempts = attempts + 1
       WHERE competition_year = ? AND event_id = ?`,
      [token, LEASE_SECONDS, job.competition_year, job.event_id],
    );
    await connection.commit();
    return { competition_year: Number(job.competition_year), event_id: job.event_id, lease_token: token };
  } catch (error) { await connection.rollback(); throw error; }
}

async function buildJob(connection: Connection, job: ClaimedProvisionalRankingJob): Promise<void> {
  await connection.beginTransaction();
  try {
    await connection.query(
      "DELETE FROM provisional_current_year_rankings WHERE year = ? AND event_id = ?",
      [job.competition_year, job.event_id],
    );
    await connection.query(provisionalCurrentYearRankingSql, [job.competition_year, job.event_id, job.competition_year, job.event_id]);
    await connection.query(
      `DELETE FROM provisional_current_year_ranking_rebuild_jobs
       WHERE competition_year = ? AND event_id = ? AND lease_token = ?`,
      [job.competition_year, job.event_id, job.lease_token],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    await connection.query(
      `UPDATE provisional_current_year_ranking_rebuild_jobs
       SET lease_token = NULL, leased_until = NULL,
         available_at = DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL LEAST(300, POW(2, attempts) * 5) SECOND), last_error = ?
       WHERE competition_year = ? AND event_id = ? AND lease_token = ?`,
      [String(error instanceof Error ? error.message : error).slice(0, 1000), job.competition_year, job.event_id, job.lease_token],
    );
    throw error;
  }
}

async function main(): Promise<void> {
  const connection = await mysql.createConnection(databaseOptions());
  try {
    for (;;) {
      const source = await claimSource(connection);
      if (source) {
        try { await saveSnapshot(connection, source); } catch (error) { process.stderr.write(`Live result poll failed: ${String(error)}\n`); }
      }
      const job = await claimJob(connection);
      if (job) {
        try { await buildJob(connection, job); } catch (error) { process.stderr.write(`Provisional ranking build failed: ${String(error)}\n`); }
      }
      if (!source && !job) await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  } finally { await connection.end(); }
}

main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`); process.exitCode = 1; });
