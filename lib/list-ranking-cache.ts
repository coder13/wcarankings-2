import type { PoolConnection } from "mysql2/promise";
import { query } from "@/db";

export const USER_LIST_MEMBER_LIMIT = 10_000;
export const LIST_RANKING_PRIORITY = { lazy: 1, active: 5, system: 10 } as const;

type ListTarget = { id: number; membershipVersion: number; kind: "user" | "system" };

export function assertListMemberCapacity(kind: "user" | "system", currentCount: number, additions: number) {
  if (kind === "user" && currentCount + additions > USER_LIST_MEMBER_LIMIT) {
    throw new Error(`User lists can contain at most ${USER_LIST_MEMBER_LIMIT.toLocaleString()} members.`);
  }
}

async function rankingsDataVersion(connection: PoolConnection) {
  const [rows] = await connection.execute<Array<{ value: string }>>(
    "SELECT value FROM export_metadata WHERE `key` = 'fetched_at' LIMIT 1",
  );
  return rows[0]?.value ?? null;
}

export async function enqueueListRankingRebuild(
  connection: PoolConnection,
  list: ListTarget,
  priority = list.kind === "system" ? LIST_RANKING_PRIORITY.system : LIST_RANKING_PRIORITY.lazy,
) {
  const dataVersion = await rankingsDataVersion(connection);
  if (!dataVersion) return;
  await connection.execute(
    `INSERT INTO list_ranking_rebuild_jobs
      (list_id, membership_version, rankings_data_version, priority, available_at, lease_token, leased_until, attempts, last_error)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(6), NULL, NULL, 0, NULL)
     ON DUPLICATE KEY UPDATE
       membership_version = VALUES(membership_version),
       rankings_data_version = VALUES(rankings_data_version),
       priority = GREATEST(priority, VALUES(priority)),
       available_at = LEAST(available_at, VALUES(available_at)),
       last_error = NULL`,
    [list.id, list.membershipVersion, dataVersion, priority],
  );
}

export async function enqueueAllListRankingRebuilds(connection: PoolConnection) {
  const dataVersion = await rankingsDataVersion(connection);
  if (!dataVersion) return;
  await connection.execute(
    `INSERT INTO list_ranking_rebuild_jobs
      (list_id, membership_version, rankings_data_version, priority, available_at, lease_token, leased_until, attempts, last_error)
     SELECT id, membership_version, ?, IF(kind = 'system', ?, ?), CURRENT_TIMESTAMP(6), NULL, NULL, 0, NULL
     FROM lists WHERE deleted_at IS NULL
     ON DUPLICATE KEY UPDATE
       membership_version = VALUES(membership_version), rankings_data_version = VALUES(rankings_data_version),
       priority = GREATEST(priority, VALUES(priority)), available_at = LEAST(available_at, VALUES(available_at)),
       last_error = NULL`,
    [dataVersion, LIST_RANKING_PRIORITY.system, LIST_RANKING_PRIORITY.lazy],
  );
}

export async function raiseListRankingRebuildPriority(list: ListTarget) {
  const result = await query<{ value: string }>("SELECT value FROM export_metadata WHERE `key` = 'fetched_at' LIMIT 1");
  const dataVersion = result.rows[0]?.value;
  if (!dataVersion) return;
  await query(
    `INSERT INTO list_ranking_rebuild_jobs (list_id, membership_version, rankings_data_version, priority, available_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(6))
     ON DUPLICATE KEY UPDATE priority = GREATEST(priority, VALUES(priority)), available_at = LEAST(available_at, VALUES(available_at))`,
    [list.id, list.membershipVersion, dataVersion, list.kind === "system" ? LIST_RANKING_PRIORITY.system : LIST_RANKING_PRIORITY.active],
  );
}
