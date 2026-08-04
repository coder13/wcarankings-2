import { randomUUID } from "node:crypto";
import mysql from "mysql2/promise";
import { hasArgument } from "./lib/cli.mjs";
import { databaseOptions } from "./lib/database.mjs";

const POLL_MS = Math.max(250, Number(process.env.LIST_RANKING_WORKER_POLL_MS) || 2_000);
const LEASE_SECONDS = Math.max(30, Number(process.env.LIST_RANKING_WORKER_LEASE_SECONDS) || 600);
const CHUNK_SIZE = Math.max(1, Math.min(1_000, Number(process.env.LIST_RANKING_WORKER_CHUNK_SIZE) || 1_000));
const RUN_ONCE = hasArgument("once");

async function claimJob(connection) {
  const token = randomUUID();
  await connection.beginTransaction();
  try {
    const [rows] = await connection.query(
      `SELECT target_key, list_id, grain, filter_key, membership_version, rankings_data_version, attempts
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
       WHERE target_key = ? AND grain = ? AND filter_key = ?`,
      [token, LEASE_SECONDS, job.target_key, job.grain, job.filter_key],
    );
    await connection.commit();
    return {
      ...job,
      target_key: String(job.target_key),
      list_id: job.list_id == null ? null : Number(job.list_id),
      grain: String(job.grain),
      filter_key: String(job.filter_key),
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
     WHERE target_key = ? AND grain = ? AND filter_key = ?
       AND membership_version = ? AND rankings_data_version = ? AND status = 'building'
     ORDER BY id DESC LIMIT 1
     FOR UPDATE`,
    [job.target_key, job.grain, job.filter_key, job.membership_version, job.rankings_data_version],
  );
  if (existing[0]) return Number(existing[0].id);

  const [created] = await connection.query(
    `INSERT INTO list_ranking_cache_versions
      (list_id, target_key, grain, filter_key, membership_version, rankings_data_version, build_token, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'building')`,
    [job.list_id, job.target_key, job.grain, job.filter_key, job.membership_version, job.rankings_data_version, randomUUID()],
  );
  const cacheVersionId = Number(created.insertId);
  await connection.query(
    `INSERT INTO list_ranking_cache_version_members (cache_version_id, person_id)
     SELECT ?, person_id FROM list_ranking_cache_target_members WHERE target_key = ?`,
    [cacheVersionId, job.target_key],
  );
  return cacheVersionId;
}

function parseFilterKey(filterKey) {
  const [scope = "world", regionId = "", genderSet = "all"] = filterKey.split("|");
  return { scope, regionId, genders: genderSet === "all" ? [] : genderSet.split(",") };
}

function sourceSpec(job, eventId, resultType) {
  const filter = parseFilterKey(job.filter_key);
  const scopeColumn = filter.scope === "continent" ? "continent" : filter.scope === "country" ? "country" : "world";
  const source = job.grain === "person"
    ? "person_event_rankings"
    : resultType === "average"
      ? "result_rankings_average"
      : "result_rankings_single";
  const rankColumn = `${scopeColumn}_rank`;
  const positionColumn = `${scopeColumn}_position`;
  const conditions = ["ranking.event_id = ?", `ranking.${rankColumn} > 0`];
  const values = [eventId];
  if (job.grain === "person") {
    conditions.push("ranking.result_type = ?");
    values.push(resultType);
  }
  if (filter.scope !== "world") {
    conditions.push(`ranking.${scopeColumn}_id = ?`);
    values.push(filter.regionId);
  }
  if (filter.genders.length) {
    conditions.push(`ranking.gender IN (${filter.genders.map(() => "?").join(",")})`);
    values.push(...filter.genders);
  }
  return { source, rankColumn, positionColumn, conditions, values, filter };
}

function scopeTable(grain) {
  return grain === "person" ? "list_person_ranking_cache_scopes" : "list_result_ranking_cache_scopes";
}

function entryTable(grain) {
  return grain === "person" ? "list_person_ranking_cache_entries" : "list_result_ranking_cache_entries";
}

async function ensureScopes(connection, cacheVersionId, job) {
  const table = scopeTable(job.grain);
  for (const resultType of ["single", "average"]) {
    const spec = sourceSpec(job, "", resultType);
    const conditions = spec.conditions.slice(1);
    const values = spec.values.slice(1);
    const resultTypeExpression = job.grain === "person" ? "ranking.result_type" : "?";
    await connection.query(
      `INSERT INTO ${table}
        (cache_version_id, event_id, result_type, total_count)
       SELECT ?, ranking.event_id, ${resultTypeExpression}, COUNT(*)
       FROM list_ranking_cache_version_members member
       JOIN ${spec.source} ranking ON ranking.person_id = member.person_id
       WHERE member.cache_version_id = ? AND ${conditions.join(" AND ")}
       GROUP BY ranking.event_id
       ON DUPLICATE KEY UPDATE total_count = VALUES(total_count)`,
      [cacheVersionId, ...(job.grain === "person" ? [] : [resultType]), cacheVersionId, ...values],
    );
  }
}

async function nextScope(connection, cacheVersionId, grain) {
  const table = scopeTable(grain);
  const [rows] = await connection.query(
    `SELECT event_id, result_type, total_count, completed_count, cursor_position, last_source_rank, last_list_rank
     FROM ${table}
     WHERE cache_version_id = ? AND is_complete = 0
     ORDER BY event_id, result_type
     LIMIT 1 FOR UPDATE`,
    [cacheVersionId],
  );
  return rows[0] ?? null;
}

async function readChunk(connection, cacheVersionId, scope, job) {
  const spec = sourceSpec(job, scope.event_id, scope.result_type);
  const attemptColumn = job.grain === "result" && scope.result_type === "single" ? "ranking.attempt_number" : "0";
  const conditions = [...spec.conditions, `ranking.${spec.positionColumn} > ?`];
  const values = [cacheVersionId, ...spec.values, Number(scope.cursor_position), CHUNK_SIZE];
  const [rows] = await connection.query(
    `SELECT ranking.person_id, ranking.result_id, ${attemptColumn} AS attempt_number,
            ranking.result_value, ranking.${spec.rankColumn} AS source_rank, ranking.${spec.positionColumn} AS source_position
     FROM list_ranking_cache_version_members member
     JOIN ${spec.source} ranking ON ranking.person_id = member.person_id
     WHERE member.cache_version_id = ?
       AND ${conditions.join(" AND ")}
     ORDER BY ranking.${spec.positionColumn}, ranking.person_id, ranking.result_id, ${attemptColumn}
     LIMIT ?`,
    values,
  );
  return rows;
}

async function insertChunk(connection, cacheVersionId, scope, rows, grain) {
  const scopeTableName = scopeTable(grain);
  if (!rows.length) {
    await connection.query(
      `UPDATE ${scopeTableName}
       SET is_complete = 1
       WHERE cache_version_id = ? AND event_id = ? AND result_type = ?`,
      [cacheVersionId, scope.event_id, scope.result_type],
    );
    return { completed: true, rows: 0 };
  }

  const completedBefore = Number(scope.completed_count);
  let previousSourceRank = Number(scope.last_source_rank);
  let listRank = Number(scope.last_list_rank);
  const table = entryTable(grain);
  const placeholders = rows.map(() => grain === "person" ? "(?, ?, ?, ?, ?, ?, ?, ?)" : "(?, ?, ?, ?, ?, ?, ?, ?, ?)").join(",");
  const values = [];
  for (const [index, row] of rows.entries()) {
    const sourceRank = Number(row.source_rank);
    if (sourceRank !== previousSourceRank) listRank = completedBefore + index + 1;
    if (grain === "person") {
      values.push(cacheVersionId, scope.event_id, scope.result_type, Number(row.result_id), row.person_id, listRank, completedBefore + index + 1, Number(row.result_value));
    } else {
      values.push(cacheVersionId, scope.event_id, scope.result_type, Number(row.result_id), Number(row.attempt_number), row.person_id, listRank, completedBefore + index + 1, Number(row.result_value));
    }
    previousSourceRank = sourceRank;
  }
  await connection.query(
    `INSERT INTO ${table}
      (${grain === "person" ? "cache_version_id, event_id, result_type, result_id, person_id" : "cache_version_id, event_id, result_type, result_id, attempt_number, person_id"}, list_rank, list_position, score)
     VALUES ${placeholders}`,
    values,
  );

  const completedCount = completedBefore + rows.length;
  const last = rows[rows.length - 1];
  const complete = completedCount >= Number(scope.total_count) || rows.length < CHUNK_SIZE;
  await connection.query(
    `UPDATE ${scopeTableName}
     SET completed_count = ?, cursor_position = ?, last_source_rank = ?, last_list_rank = ?, is_complete = ?
     WHERE cache_version_id = ? AND event_id = ? AND result_type = ?`,
    [completedCount, Number(last.source_position), previousSourceRank, listRank, complete ? 1 : 0, cacheVersionId, scope.event_id, scope.result_type],
  );
  return { completed: complete, rows: rows.length };
}

async function allScopesComplete(connection, cacheVersionId, grain) {
  const table = scopeTable(grain);
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS incomplete
     FROM ${table}
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
     WHERE target_key = ? AND grain = ? AND filter_key = ? AND lease_token = ?
       AND membership_version = ? AND rankings_data_version = ?`,
    [job.target_key, job.grain, job.filter_key, job.lease_token, job.membership_version, job.rankings_data_version],
  );
}

async function requeueJob(connection, job) {
  await connection.query(
    `UPDATE list_ranking_rebuild_jobs
     SET lease_token = NULL, leased_until = NULL, available_at = CURRENT_TIMESTAMP(6), last_error = NULL
     WHERE target_key = ? AND grain = ? AND filter_key = ? AND lease_token = ?
       AND membership_version = ? AND rankings_data_version = ?`,
    [job.target_key, job.grain, job.filter_key, job.lease_token, job.membership_version, job.rankings_data_version],
  );
}

async function buildJob(connection, job) {
  await connection.beginTransaction();
  try {
    const cacheVersionId = await createOrResumeVersion(connection, job);
    await ensureScopes(connection, cacheVersionId, job);
    const scope = await nextScope(connection, cacheVersionId, job.grain);
    if (!scope) {
      await finishJob(connection, job, cacheVersionId, await currentBuildIsValid(connection, job));
      await connection.commit();
      return { targetKey: job.target_key, grain: job.grain, filterKey: job.filter_key, cacheVersionId, rows: 0, complete: true };
    }
    const rows = await readChunk(connection, cacheVersionId, scope, job);
    const result = await insertChunk(connection, cacheVersionId, scope, rows, job.grain);
    const complete = result.completed && await allScopesComplete(connection, cacheVersionId, job.grain);
    if (complete) {
      await finishJob(connection, job, cacheVersionId, await currentBuildIsValid(connection, job));
    } else {
      await requeueJob(connection, job);
    }
    await connection.commit();
    return { targetKey: job.target_key, grain: job.grain, filterKey: job.filter_key, cacheVersionId, rows: result.rows, complete };
  } catch (error) {
    await connection.rollback();
    await connection.query(
      `UPDATE list_ranking_rebuild_jobs
       SET lease_token = NULL, leased_until = NULL,
           available_at = DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL LEAST(300, POW(2, attempts) * 5) SECOND),
           last_error = ?
       WHERE target_key = ? AND grain = ? AND filter_key = ? AND lease_token = ?`,
      [String(error instanceof Error ? error.message : error).slice(0, 1000), job.target_key, job.grain, job.filter_key, job.lease_token],
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
