import { randomUUID } from "node:crypto";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";
import { argumentPresent, argumentValue } from "./lib/arguments.ts";
import { databaseOptions } from "./lib/database.ts";
import { enqueueProjectionJob } from "../packages/projection-jobs/src/queue.ts";
import { fetchLiveResults, snapshotHash } from "./live-results/providers.ts";
import type { LiveResultsSnapshot, LiveResultsSourceRow } from "./live-results/types.ts";

const POLL_MS = Math.max(250, Number(process.env.PROVISIONAL_RANKING_WORKER_POLL_MS) || 2_000);
const LEASE_SECONDS = Math.max(30, Number(process.env.PROVISIONAL_RANKING_WORKER_LEASE_SECONDS) || 120);
const selectedCompetition = argumentValue("competition");
const once = argumentPresent("once");

async function claimSource(connection: Connection): Promise<LiveResultsSourceRow | null> {
  const token = randomUUID();
  await connection.beginTransaction();
  try {
    const [rows] = await connection.query<(LiveResultsSourceRow & RowDataPacket)[]>(
      `SELECT source_name, competition_id, remote_competition_id, competition_year
       FROM provisional_live_result_sources
       WHERE enabled = 1 AND (? = '' OR competition_id = ?)
         AND (? <> '' OR (next_poll_at <= CURRENT_TIMESTAMP(6)
           AND (leased_until IS NULL OR leased_until < CURRENT_TIMESTAMP(6))))
       ORDER BY next_poll_at, competition_id LIMIT 1 FOR UPDATE SKIP LOCKED`,
      [selectedCompetition, selectedCompetition, selectedCompetition],
    );
    const source = rows[0];
    if (!source) { await connection.commit(); return null; }
    await connection.query(
      `UPDATE provisional_live_result_sources SET lease_token = ?,
       leased_until = DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL ? SECOND)
       WHERE source_name = ? AND competition_id = ?`,
      [token, LEASE_SECONDS, source.source_name, source.competition_id],
    );
    await connection.commit();
    return { ...source, competition_year: Number(source.competition_year), lease_token: token };
  } catch (error) { await connection.rollback(); throw error; }
}

function partitionJobs(source: LiveResultsSourceRow, snapshot: LiveResultsSnapshot, version: number) {
  const jobs = new Map<string, Record<string, string>>();
  const add = (key: string, payload: Record<string, string>) => jobs.set(key, payload);
  add(`competition-stats:${source.competition_id}`, { competitionId: source.competition_id, year: String(source.competition_year) });
  for (const result of snapshot.results) {
    add(`person-stats:${result.personId}:${source.competition_year}`, { personId: result.personId, year: String(source.competition_year) });
    const region = result.countryIso2 ?? "unknown";
    for (const resultType of ["single", "average"]) {
      add(`rankings:${result.eventId}:${resultType}:country:${region}:${source.competition_year}`, {
        eventId: result.eventId, resultType, region, year: String(source.competition_year), provisional: "true",
      });
    }
  }
  return [...jobs].map(([key, payload]) => ({ kind: "projection-rebuild" as const, key, version, payload }));
}

async function saveSnapshot(connection: Connection, source: LiveResultsSourceRow): Promise<void> {
  const snapshot = await fetchLiveResults(source.source_name, source.remote_competition_id);
  const hash = snapshotHash(snapshot);
  let version: number | null = null;
  await connection.beginTransaction();
  try {
    const [state] = await connection.query<RowDataPacket[]>(
      `SELECT snapshot_hash FROM provisional_live_result_sources
       WHERE source_name = ? AND competition_id = ? AND lease_token = ? FOR UPDATE`,
      [source.source_name, source.competition_id, source.lease_token],
    );
    if (!state[0]) throw new Error("Live result source lease was lost.");
    if (state[0].snapshot_hash !== hash) {
      await connection.query("DELETE FROM provisional_live_results WHERE source_name = ? AND competition_id = ?", [source.source_name, source.competition_id]);
      for (const result of snapshot.results) await connection.query(
        `INSERT INTO provisional_live_results
         (source_name, competition_id, source_result_id, event_id, round_number, round_type_id, format_id, person_id, person_name, country_iso2, best, average, position, attempts_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [source.source_name, source.competition_id, result.sourceResultId, result.eventId, result.roundNumber, result.roundTypeId, result.formatId, result.personId, result.personName, result.countryIso2, result.best, result.average, result.position, JSON.stringify(result.attempts)],
      );
      await connection.query("UPDATE provisional_live_result_state SET source_version = source_version + 1 WHERE id = 1");
      const [versions] = await connection.query<RowDataPacket[]>("SELECT source_version FROM provisional_live_result_state WHERE id = 1");
      version = Number(versions[0]?.source_version);
    }
    await connection.query(
      `UPDATE provisional_live_result_sources SET snapshot_hash = ?, last_success_at = CURRENT_TIMESTAMP(6), last_error = NULL,
       next_poll_at = DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL poll_seconds SECOND), lease_token = NULL, leased_until = NULL
       WHERE source_name = ? AND competition_id = ? AND lease_token = ?`,
      [hash, source.source_name, source.competition_id, source.lease_token],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    await connection.query(`UPDATE provisional_live_result_sources SET lease_token = NULL, leased_until = NULL,
      next_poll_at = DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL 60 SECOND), last_error = ?
      WHERE source_name = ? AND competition_id = ? AND lease_token = ?`,
      [String(error instanceof Error ? error.message : error).slice(0, 1000), source.source_name, source.competition_id, source.lease_token]);
    throw error;
  }
  if (version !== null) for (const job of partitionJobs(source, snapshot, version)) await enqueueProjectionJob(job);
}

async function main(): Promise<void> {
  const connection = await mysql.createConnection(databaseOptions());
  try {
    do {
      const source = await claimSource(connection);
      if (source) await saveSnapshot(connection, source);
      if (once || selectedCompetition) return;
      if (!source) await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    } while (true);
  } finally { await connection.end(); }
}

main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`); process.exitCode = 1; });
