/* eslint-disable @typescript-eslint/ban-ts-comment */
export const LIST_RANKING_PRIORITY = { lazy: 1, active: 5, system: 10 };

async function dataVersion(connection) {
  const [rows] = await connection.query(
    "SELECT value FROM export_metadata WHERE `key` = 'fetched_at' LIMIT 1",
  );
  return rows[0]?.value ?? null;
}

export async function enqueueListRankingRebuild(
  connection,
  list,
  priority = list.kind === "system"
    ? LIST_RANKING_PRIORITY.system
    : LIST_RANKING_PRIORITY.lazy,
) {
  const version = await dataVersion(connection);
  if (!version) return;
  await connection.query(
    `INSERT INTO list_ranking_rebuild_jobs
      (list_id, membership_version, rankings_data_version, priority, available_at, lease_token, leased_until, attempts, last_error)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(6), NULL, NULL, 0, NULL)
     ON DUPLICATE KEY UPDATE membership_version = VALUES(membership_version),
       rankings_data_version = VALUES(rankings_data_version), priority = GREATEST(priority, VALUES(priority)),
       available_at = LEAST(available_at, VALUES(available_at)), last_error = NULL`,
    [list.id, list.membershipVersion, version, priority],
  );
}

export async function enqueueAllListRankingRebuilds(connection) {
  const version = await dataVersion(connection);
  if (!version) return;
  await connection.query(
    `INSERT INTO list_ranking_rebuild_jobs
      (list_id, membership_version, rankings_data_version, priority, available_at, lease_token, leased_until, attempts, last_error)
     SELECT id, membership_version, ?, IF(kind = 'system', ?, ?), CURRENT_TIMESTAMP(6), NULL, NULL, 0, NULL
     FROM lists WHERE deleted_at IS NULL
     ON DUPLICATE KEY UPDATE membership_version = VALUES(membership_version), rankings_data_version = VALUES(rankings_data_version),
       priority = GREATEST(priority, VALUES(priority)), available_at = LEAST(available_at, VALUES(available_at)),
       last_error = NULL`,
    [version, LIST_RANKING_PRIORITY.system, LIST_RANKING_PRIORITY.lazy],
  );
}
