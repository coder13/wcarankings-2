import { createHash } from "node:crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { query } from "@/db";

export const USER_LIST_MEMBER_LIMIT = 10_000;
const LIST_RANKING_PRIORITY = {
  lazy: 1,
  active: 5,
  system: 10,
} as const;
export type ListRankingGrain = "person" | "result";
export type ListRankingFilter = {
  scope: "world" | "continent" | "country";
  regionId: string;
  genders: readonly string[];
};

const GENDER_ORDER = new Map([
  ["m", 0],
  ["f", 1],
  ["o", 2],
]);

function listRankingGenderSet(genders: readonly string[]) {
  return [...genders]
    .sort(
      (left, right) =>
        (GENDER_ORDER.get(left) ?? 99) - (GENDER_ORDER.get(right) ?? 99),
    )
    .join(",");
}

type ListTarget = {
  id: number;
  membershipVersion: number;
  kind: "user" | "system";
};

export function listRankingFilterKey(filter: ListRankingFilter) {
  return `${filter.scope}|${filter.scope === "world" ? "" : filter.regionId}|${filter.genders.length ? listRankingGenderSet(filter.genders) : "all"}`;
}

export function isListRankingCacheable(
  grain: ListRankingGrain,
  resultType: "single" | "average",
  filter: ListRankingFilter,
) {
  if (grain === "person") return filter.genders.length === 0;
  if (filter.genders.length === 0) return true;
  if (resultType === "single") {
    return filter.genders.length === 1 && filter.scope !== "country";
  }
  return filter.genders.length <= 2;
}

function savedTargetKey(listId: number) {
  return `list:${listId}`;
}

async function refreshSavedTarget(
  connection: PoolConnection,
  list: ListTarget,
) {
  const targetKey = savedTargetKey(list.id);
  await connection.execute(
    `INSERT INTO list_ranking_cache_targets
      (target_key, list_id, target_kind, membership_version, member_count)
     VALUES (?, ?, 'saved', ?, (SELECT COUNT(*) FROM list_members WHERE list_id = ?))
     ON DUPLICATE KEY UPDATE
       list_id = VALUES(list_id), membership_version = VALUES(membership_version), member_count = VALUES(member_count)`,
    [targetKey, list.id, list.membershipVersion, list.id],
  );
  await connection.execute(
    "DELETE FROM list_ranking_cache_target_members WHERE target_key = ?",
    [targetKey],
  );
  await connection.execute(
    `INSERT INTO list_ranking_cache_target_members (target_key, person_id)
     SELECT ?, person_id FROM list_members WHERE list_id = ?`,
    [targetKey, list.id],
  );
  return targetKey;
}

export function assertListMemberCapacity(
  kind: "user" | "system",
  currentCount: number,
  additions: number,
) {
  if (kind === "user" && currentCount + additions > USER_LIST_MEMBER_LIMIT) {
    throw new Error(
      `User lists can contain at most ${USER_LIST_MEMBER_LIMIT.toLocaleString()} members.`,
    );
  }
}

async function rankingsDataVersion(connection: PoolConnection) {
  const [rows] = await connection.execute<
    Array<RowDataPacket & { value: string }>
  >("SELECT value FROM export_metadata WHERE `key` = 'fetched_at' LIMIT 1");
  return rows[0]?.value ?? null;
}

export async function enqueueListRankingRebuild(
  connection: PoolConnection,
  list: ListTarget,
  priority = list.kind === "system"
    ? LIST_RANKING_PRIORITY.system
    : LIST_RANKING_PRIORITY.lazy,
  grain: ListRankingGrain = "person",
  filterKey = "world||all",
) {
  const dataVersion = await rankingsDataVersion(connection);
  if (!dataVersion) return;
  const targetKey = await refreshSavedTarget(connection, list);
  await connection.execute(
    `INSERT INTO list_ranking_rebuild_jobs
      (list_id, target_key, grain, filter_key, membership_version, rankings_data_version, priority, available_at, lease_token, leased_until, attempts, last_error)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(6), NULL, NULL, 0, NULL)
     ON DUPLICATE KEY UPDATE
       list_id = VALUES(list_id),
       grain = VALUES(grain), filter_key = VALUES(filter_key),
       membership_version = VALUES(membership_version),
       rankings_data_version = VALUES(rankings_data_version),
       priority = GREATEST(priority, VALUES(priority)),
       available_at = LEAST(available_at, VALUES(available_at)),
       last_error = NULL`,
    [
      list.id,
      targetKey,
      grain,
      filterKey,
      list.membershipVersion,
      dataVersion,
      priority,
    ],
  );
}

export async function raiseListRankingRebuildPriority(
  list: ListTarget,
  grain: ListRankingGrain = "person",
  filterKey = "world||all",
) {
  const result = await query<{ value: string }>(
    "SELECT value FROM export_metadata WHERE `key` = 'fetched_at' LIMIT 1",
  );
  const dataVersion = result.rows[0]?.value;
  if (!dataVersion) return;
  const targetKey = savedTargetKey(list.id);
  await query(
    `INSERT INTO list_ranking_cache_targets
      (target_key, list_id, target_kind, membership_version, member_count)
     VALUES (?, ?, 'saved', ?, (SELECT COUNT(*) FROM list_members WHERE list_id = ?))
     ON DUPLICATE KEY UPDATE
       list_id = VALUES(list_id), membership_version = VALUES(membership_version), member_count = VALUES(member_count)`,
    [targetKey, list.id, list.membershipVersion, list.id],
  );
  await query(
    "DELETE FROM list_ranking_cache_target_members WHERE target_key = ?",
    [targetKey],
  );
  await query(
    `INSERT INTO list_ranking_cache_target_members (target_key, person_id)
     SELECT ?, person_id FROM list_members WHERE list_id = ?`,
    [targetKey, list.id],
  );
  await query(
    `INSERT INTO list_ranking_rebuild_jobs
      (list_id, target_key, grain, filter_key, membership_version, rankings_data_version, priority, available_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP(6))
     ON DUPLICATE KEY UPDATE
       list_id = VALUES(list_id), grain = VALUES(grain), filter_key = VALUES(filter_key), membership_version = VALUES(membership_version), rankings_data_version = VALUES(rankings_data_version),
       priority = GREATEST(priority, VALUES(priority)), available_at = LEAST(available_at, VALUES(available_at))`,
    [
      list.id,
      targetKey,
      grain,
      filterKey,
      list.membershipVersion,
      dataVersion,
      list.kind === "system"
        ? LIST_RANKING_PRIORITY.system
        : LIST_RANKING_PRIORITY.active,
    ],
  );
}

export async function ensureDynamicListRankingTarget(
  personIds: string[],
  grain: ListRankingGrain = "person",
  filterKey = "world||all",
) {
  const normalized = [...new Set(personIds)].sort();
  const targetKey = `dynamic:${createHash("sha256").update(normalized.join(",")).digest("hex")}`;
  const result = await query<{ value: string }>(
    "SELECT value FROM export_metadata WHERE `key` = 'fetched_at' LIMIT 1",
  );
  const dataVersion = result.rows[0]?.value;
  if (!dataVersion) return null;
  await query(
    `INSERT INTO list_ranking_cache_targets
      (target_key, list_id, target_kind, membership_version, member_count)
     VALUES (?, NULL, 'dynamic', 1, ?)
     ON DUPLICATE KEY UPDATE member_count = VALUES(member_count)`,
    [targetKey, normalized.length],
  );
  if (normalized.length) {
    await query(
      `INSERT IGNORE INTO list_ranking_cache_target_members (target_key, person_id)
       VALUES ${normalized.map(() => "(?, ?)").join(",")}`,
      normalized.flatMap((personId) => [targetKey, personId]),
    );
  }
  const ready = await query<{ id: number }>(
    `SELECT id FROM list_ranking_cache_versions
     WHERE target_key = ? AND grain = ? AND filter_key = ?
       AND membership_version = 1 AND rankings_data_version = ? AND status = 'ready'
     LIMIT 1`,
    [targetKey, grain, filterKey, dataVersion],
  );
  if (!ready.rows.length) {
    await query(
      `INSERT INTO list_ranking_rebuild_jobs
        (list_id, target_key, grain, filter_key, membership_version, rankings_data_version, priority, available_at)
       VALUES (NULL, ?, ?, ?, 1, ?, ?, CURRENT_TIMESTAMP(6))
       ON DUPLICATE KEY UPDATE
         grain = VALUES(grain), filter_key = VALUES(filter_key), membership_version = VALUES(membership_version), rankings_data_version = VALUES(rankings_data_version),
         priority = GREATEST(priority, VALUES(priority)), available_at = LEAST(available_at, VALUES(available_at))`,
      [targetKey, grain, filterKey, dataVersion, LIST_RANKING_PRIORITY.active],
    );
  }
  return { targetKey, membershipVersion: 1, rankingsDataVersion: dataVersion };
}
