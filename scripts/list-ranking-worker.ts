import { databaseOptions } from "./lib/database.ts";
import { randomUUID } from "node:crypto";
import mysql from "mysql2/promise";
import type { Connection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { ClaimedRankingRebuildJob, CurrentListVersion } from "./list-ranking-worker-types.ts";

const POLL_MS = Math.max(
  250,
  Number(process.env.LIST_RANKING_WORKER_POLL_MS) || 2_000,
);
const LEASE_SECONDS = Math.max(
  30,
  Number(process.env.LIST_RANKING_WORKER_LEASE_SECONDS) || 600,
);

async function claimJob(connection: Connection): Promise<ClaimedRankingRebuildJob | null> {
  const token = randomUUID();
  await connection.beginTransaction();
  try {
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT list_id, membership_version, rankings_data_version, attempts
       FROM list_ranking_rebuild_jobs
       WHERE available_at <= CURRENT_TIMESTAMP(6)
         AND (leased_until IS NULL OR leased_until < CURRENT_TIMESTAMP(6))
       ORDER BY priority DESC, available_at, list_id
       LIMIT 1 FOR UPDATE SKIP LOCKED`,
    );
    const job = rows[0];
    if (!job) {
      await connection.commit();
      return null;
    }
    await connection.query(
      "UPDATE list_ranking_rebuild_jobs SET lease_token = ?, leased_until = DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL ? SECOND), attempts = attempts + 1 WHERE list_id = ?",
      [token, LEASE_SECONDS, job.list_id],
    );
    await connection.commit();
    return {
      ...job,
      list_id: Number(job.list_id),
      membership_version: Number(job.membership_version),
      rankings_data_version: String(job.rankings_data_version),
      lease_token: token,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function buildJob(connection: Connection, job: ClaimedRankingRebuildJob): Promise<void> {
  const token = randomUUID();
  await connection.beginTransaction();
  try {
    const [created] = await connection.query<ResultSetHeader>(
      `INSERT INTO list_ranking_cache_versions (list_id, membership_version, rankings_data_version, build_token, status)
       VALUES (?, ?, ?, ?, 'building')`,
      [job.list_id, job.membership_version, job.rankings_data_version, token],
    );
    const cacheVersionId = Number(created.insertId);
    for (const [resultType, table] of [
      ["single", "ranking_entries_single"],
      ["average", "ranking_entries_average"],
    ]) {
      await connection.query(
        `INSERT INTO list_ranking_cache_entries
          (cache_version_id, event_id, result_type, person_id, list_rank, list_position, score)
         SELECT ?, ranked.event_id, ?, ranked.person_id, ranked.list_rank, ranked.list_position, ranked.best
         FROM (
           SELECT ranking.event_id, ranking.person_id, ranking.best,
             RANK() OVER (PARTITION BY ranking.event_id ORDER BY ranking.best) AS list_rank,
             ROW_NUMBER() OVER (PARTITION BY ranking.event_id ORDER BY ranking.best, ranking.person_name, ranking.person_id) AS list_position
           FROM list_members member
           JOIN ${table} ranking ON ranking.person_id = member.person_id
           WHERE member.list_id = ? AND ranking.world_rank > 0
         ) ranked`,
        [cacheVersionId, resultType, job.list_id],
      );
      await connection.query(
        `INSERT INTO list_ranking_cache_scopes (cache_version_id, event_id, result_type, total_count)
         SELECT ?, event_id, ?, COUNT(*) FROM list_ranking_cache_entries
         WHERE cache_version_id = ? AND result_type = ? GROUP BY event_id`,
        [cacheVersionId, resultType, cacheVersionId, resultType],
      );
    }
    const [current] = await connection.query<CurrentListVersion[]>(
      `SELECT list.membership_version, metadata.value AS rankings_data_version
       FROM lists list JOIN export_metadata metadata ON metadata.\`key\` = 'fetched_at'
       WHERE list.id = ? AND list.deleted_at IS NULL FOR UPDATE`,
      [job.list_id],
    );
    const currentVersion = current[0];
    const valid =
      currentVersion !== undefined &&
      Number(currentVersion.membership_version) === job.membership_version &&
      currentVersion.rankings_data_version === job.rankings_data_version;
    await connection.query(
      "UPDATE list_ranking_cache_versions SET status = ?, completed_at = CURRENT_TIMESTAMP(6), activated_at = IF(? = 'ready', CURRENT_TIMESTAMP(6), NULL), error_message = NULL WHERE id = ?",
      [valid ? "ready" : "stale", valid ? "ready" : "stale", cacheVersionId],
    );
    await connection.query(
      `DELETE FROM list_ranking_rebuild_jobs
       WHERE list_id = ? AND lease_token = ? AND membership_version = ? AND rankings_data_version = ?`,
      [
        job.list_id,
        job.lease_token,
        job.membership_version,
        job.rankings_data_version,
      ],
    );
    await connection.query(
      `UPDATE list_ranking_rebuild_jobs SET lease_token = NULL, leased_until = NULL, available_at = CURRENT_TIMESTAMP(6)
       WHERE list_id = ? AND lease_token = ?`,
      [job.list_id, job.lease_token],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    await connection.query(
      `UPDATE list_ranking_rebuild_jobs SET lease_token = NULL, leased_until = NULL, available_at = DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL LEAST(300, POW(2, attempts) * 5) SECOND), last_error = ? WHERE list_id = ? AND lease_token = ?`,
      [
        String(error instanceof Error ? error.message : error).slice(0, 1000),
        job.list_id,
        job.lease_token,
      ],
    );
    throw error;
  }
}

async function main(): Promise<void> {
  const connection = await mysql.createConnection(databaseOptions());
  try {
    for (;;) {
      const job = await claimJob(connection);
      if (!job) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        continue;
      }
      try {
        await buildJob(connection, job);
      } catch (error) {
        process.stderr.write(
          `List ranking build failed: ${error instanceof Error ? error.message : error}\n`,
        );
      }
    }
  } finally {
    await connection.end();
  }
}
main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
