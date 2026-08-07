import { query as defaultQuery } from "@/db";
import type { FeedInterestingResult } from "./stat-previews";

type FeedQuery = (
  text: string,
  values?: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>;

const FEED_SNAPSHOT_FORMAT = "v8";

export type FeedSnapshot = {
  exportVersion: string;
  candidates: FeedInterestingResult[];
};

export async function currentFeedExportVersion(
  query: FeedQuery = defaultQuery,
) {
  const result = await query(
    "SELECT value FROM export_metadata WHERE `key` = 'fetched_at' LIMIT 1",
  );
  return `${FEED_SNAPSHOT_FORMAT}:${String(result.rows[0]?.value ?? "unavailable")}`;
}

export async function readFeedSnapshot(options: { query?: FeedQuery } = {}) {
  const query = options.query ?? defaultQuery;
  const exportVersion = await currentFeedExportVersion(query);
  const result = await query(
    "SELECT snapshot_json FROM feed_snapshots WHERE export_version = ? LIMIT 1",
    [exportVersion],
  );
  const snapshot = result.rows[0]?.snapshot_json;
  if (typeof snapshot !== "string") return null;
  return JSON.parse(snapshot) as FeedSnapshot;
}

export async function writeFeedSnapshot(
  snapshot: FeedSnapshot,
  options: { query?: FeedQuery } = {},
) {
  const query = options.query ?? defaultQuery;
  await query(
    `INSERT INTO feed_snapshots (export_version, snapshot_json)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE snapshot_json = VALUES(snapshot_json),
       created_at = CURRENT_TIMESTAMP(6)`,
    [snapshot.exportVersion, JSON.stringify(snapshot)],
  );
}
