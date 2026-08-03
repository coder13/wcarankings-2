import { randomUUID } from "node:crypto";
import mysql from "mysql2/promise";

const POLL_MS = Math.max(250, Number(process.env.LIST_RANKING_WORKER_POLL_MS) || 2_000);
const LEASE_SECONDS = Math.max(30, Number(process.env.LIST_RANKING_WORKER_LEASE_SECONDS) || 600);
const CHUNK_SIZE = Math.max(1, Math.min(1_000, Number(process.env.LIST_RANKING_WORKER_CHUNK_SIZE) || 1_000));
const RUN_ONCE = process.argv.includes("--once");

function databaseOptions(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const url = new URL(connectionString);
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
  };
}

async function claimJob(connection) {
  const token = randomUUID();
  await connection.beginTransaction();
  try {
    const [rows] = await connection.query(
      `SELECT target_key, list_id, membership_version, rankings_data_version, attempts
       FROM list_ranking_rebuild_jobs
       WHERE available_at <= CURRENT_TIMESTAMP(6)
         AND (leased_until IS NULL OR leased_until < CURRENT_TIMESTAMP(6))
       ORDER BY priority DESC, available_at, target_key
       LIMIT 1 FOR UPDATE SKIP LOCKED`,
    );
    const job = rows[0];
    if (!job) {
      await connection.commit();
      return null;
    }
    await connection.query(
      `UPDATE list_ranking_rebuild_jobs
       SET lease_token = ?, leased_until = DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL ? SECOND), attempts = attempts + 1
       WHERE target_key = ?`,
      [token, LEASE_SECONDS, job.target_key],
    );
    await connection.commit();
    return {
      ...job,
      target_key: String(job.target_key),
      list_id: job.list_id == null ? null : Number(job.list_id),
      membership_version: Number(job.membership_version),
      lease_token: token,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function createOrResumeVersion(connection, job) {
  const [existing] = await connection.query(
    `SELECT id
     FROM list_ranking_cache_versions
     WHERE target_key = ? AND membership_version = ? AND rankings_data_version = ? AND status = 'building'
     ORDER BY id DESC LIMIT 1
     FOR UPDATE`,
    [job.target_key, job.membership_version, job.rankings_data_version],
  );
  if (existing[0]) return Number(existing[0].id);

  const [created] = await connection.query(
    `INSERT INTO list_ranking_cache_versions
      (list_id, target_key, membership_version, rankings_data_version, build_token, status)
     VALUES (?, ?, ?, ?, ?, 'building')`,
    [job.list_id, job.target_key, job.membership_version, job.rankings_data_version, randomUUID()],
  );
  const cacheVersionId = Number(created.insertId);
  await connection.query(
    `INSERT INTO list_ranking_cache_version_members (cache_version_id, person_id)
     SELECT ?, person_id FROM list_ranking_cache_target_members WHERE target_key = ?`,
    [cacheVersionId, job.target_key],
  );
  return cacheVersionId;
}

async function ensureScopes(connection, cacheVersionId) {
  await connection.query(
    `INSERT INTO list_ranking_cache_scopes
      (cache_version_id, event_id, result_type, total_count)
     SELECT ?, ranking.event_id, ranking.result_type, COUNT(*)
     FROM list_ranking_cache_version_members member
     JOIN person_event_rankings ranking ON ranking.person_id = member.person_id
     WHERE member.cache_version_id = ? AND ranking.world_rank > 0
     GROUP BY ranking.event_id, ranking.result_type
     ON DUPLICATE KEY UPDATE total_count = VALUES(total_count)`,
    [cacheVersionId, cacheVersionId],
  );
}

async function nextScope(connection, cacheVersionId) {
  const [rows] = await connection.query(
    `SELECT event_id, result_type, total_count, completed_count, cursor_position, last_source_rank, last_list_rank
     FROM list_ranking_cache_scopes
     WHERE cache_version_id = ? AND is_complete = 0
     ORDER BY event_id, result_type
     LIMIT 1 FOR UPDATE`,
    [cacheVersionId],
  );
  return rows[0] ?? null;
}

async function readChunk(connection, cacheVersionId, scope) {
  const [rows] = await connection.query(
    `SELECT ranking.person_id, ranking.result_id, ranking.result_value, ranking.world_rank, ranking.world_position
     FROM list_ranking_cache_version_members member
     JOIN person_event_rankings ranking
       ON ranking.person_id = member.person_id
      AND ranking.event_id = ?
      AND ranking.result_type = ?
      AND ranking.world_rank > 0
      AND ranking.world_position > ?
     WHERE member.cache_version_id = ?
     ORDER BY ranking.world_position, ranking.person_id
     LIMIT ?`,
    [scope.event_id, scope.result_type, Number(scope.cursor_position), cacheVersionId, CHUNK_SIZE],
  );
  return rows;
}

async function insertChunk(connection, cacheVersionId, scope, rows) {
  if (!rows.length) {
    await connection.query(
      `UPDATE list_ranking_cache_scopes
       SET is_complete = 1
       WHERE cache_version_id = ? AND event_id = ? AND result_type = ?`,
      [cacheVersionId, scope.event_id, scope.result_type],
    );
    return { completed: true, rows: 0 };
  }

  const completedBefore = Number(scope.completed_count);
  let previousSourceRank = Number(scope.last_source_rank);
  let listRank = Number(scope.last_list_rank);
  const values = [];
  for (const [index, row] of rows.entries()) {
    const sourceRank = Number(row.world_rank);
    if (sourceRank !== previousSourceRank) listRank = completedBefore + index + 1;
    values.push(
      cacheVersionId,
      scope.event_id,
      scope.result_type,
      Number(row.result_id),
      row.person_id,
      listRank,
      completedBefore + index + 1,
      Number(row.result_value),
    );
    previousSourceRank = sourceRank;
  }
  const placeholders = rows.map(() => "(?, ?, ?, ?, ?, ?, ?, ?)").join(",");
  await connection.query(
    `INSERT INTO list_ranking_cache_entries
      (cache_version_id, event_id, result_type, result_id, person_id, list_rank, list_position, score)
     VALUES ${placeholders}`,
    values,
  );

  const completedCount = completedBefore + rows.length;
  const last = rows[rows.length - 1];
  const complete = completedCount >= Number(scope.total_count) || rows.length < CHUNK_SIZE;
  await connection.query(
    `UPDATE list_ranking_cache_scopes
     SET completed_count = ?, cursor_position = ?, last_source_rank = ?, last_list_rank = ?, is_complete = ?
     WHERE cache_version_id = ? AND event_id = ? AND result_type = ?`,
    [completedCount, Number(last.world_position), previousSourceRank, listRank, complete ? 1 : 0, cacheVersionId, scope.event_id, scope.result_type],
  );
  return { completed: complete, rows: rows.length };
}

async function allScopesComplete(connection, cacheVersionId) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS incomplete
     FROM list_ranking_cache_scopes
     WHERE cache_version_id = ? AND is_complete = 0`,
    [cacheVersionId],
  );
  return Number(rows[0]?.incomplete ?? 0) === 0;
}

async function currentBuildIsValid(connection, job) {
  if (job.list_id == null) return true;
  const [rows] = await connection.query(
    `SELECT list.membership_version, metadata.value AS rankings_data_version
     FROM lists list
     JOIN export_metadata metadata ON metadata.key = 'fetched_at'
     WHERE list.id = ? AND list.deleted_at IS NULL
     LIMIT 1`,
    [job.list_id],
  );
  return Boolean(
    rows[0] &&
    Number(rows[0].membership_version) === job.membership_version &&
    rows[0].rankings_data_version === job.rankings_data_version,
  );
}

async function finishJob(connection, job, cacheVersionId, ready) {
  await connection.query(
    `UPDATE list_ranking_cache_versions
     SET status = ?, completed_at = CURRENT_TIMESTAMP(6), activated_at = IF(? = 'ready', CURRENT_TIMESTAMP(6), NULL), error_message = NULL
     WHERE id = ?`,
    [ready ? "ready" : "stale", ready ? "ready" : "stale", cacheVersionId],
  );
  await connection.query(
    `DELETE FROM list_ranking_rebuild_jobs
     WHERE target_key = ? AND lease_token = ? AND membership_version = ? AND rankings_data_version = ?`,
    [job.target_key, job.lease_token, job.membership_version, job.rankings_data_version],
  );
}

async function requeueJob(connection, job) {
  await connection.query(
    `UPDATE list_ranking_rebuild_jobs
     SET lease_token = NULL, leased_until = NULL, available_at = CURRENT_TIMESTAMP(6), last_error = NULL
     WHERE target_key = ? AND lease_token = ? AND membership_version = ? AND rankings_data_version = ?`,
    [job.target_key, job.lease_token, job.membership_version, job.rankings_data_version],
  );
}

async function buildJob(connection, job) {
  await connection.beginTransaction();
  try {
    const cacheVersionId = await createOrResumeVersion(connection, job);
    await ensureScopes(connection, cacheVersionId);
    const scope = await nextScope(connection, cacheVersionId);
    if (!scope) {
      await finishJob(connection, job, cacheVersionId, await currentBuildIsValid(connection, job));
      await connection.commit();
      return { targetKey: job.target_key, cacheVersionId, rows: 0, complete: true };
    }
    const rows = await readChunk(connection, cacheVersionId, scope);
    const result = await insertChunk(connection, cacheVersionId, scope, rows);
    const complete = result.completed && await allScopesComplete(connection, cacheVersionId);
    if (complete) {
      await finishJob(connection, job, cacheVersionId, await currentBuildIsValid(connection, job));
    } else {
      await requeueJob(connection, job);
    }
    await connection.commit();
    return { targetKey: job.target_key, cacheVersionId, rows: result.rows, complete };
  } catch (error) {
    await connection.rollback();
    await connection.query(
      `UPDATE list_ranking_rebuild_jobs
       SET lease_token = NULL, leased_until = NULL,
           available_at = DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL LEAST(300, POW(2, attempts) * 5) SECOND),
           last_error = ?
       WHERE target_key = ? AND lease_token = ?`,
      [String(error instanceof Error ? error.message : error).slice(0, 1000), job.target_key, job.lease_token],
    );
    throw error;
  }
}

async function main() {
  const connection = await mysql.createConnection(databaseOptions());
  try {
    for (;;) {
      const job = await claimJob(connection);
      if (!job) {
        if (RUN_ONCE) return;
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        continue;
      }
      try {
        const result = await buildJob(connection, job);
        process.stdout.write(`${JSON.stringify({ operation: "list-ranking-chunk", ...result })}\n`);
      } catch (error) {
        process.stderr.write(`List ranking build failed: ${error instanceof Error ? error.message : error}\n`);
      }
      if (RUN_ONCE) return;
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
