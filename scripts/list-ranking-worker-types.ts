import type { RowDataPacket } from "mysql2/promise";

export interface RankingRebuildJob extends RowDataPacket {
  list_id: number;
  membership_version: number;
  rankings_data_version: string;
  lease_token: string;
}

export type ClaimedRankingRebuildJob = RankingRebuildJob;

export interface CacheVersionInsert {
  insertId: number;
}

export interface CurrentListVersion extends RowDataPacket {
  membership_version: number;
  rankings_data_version: string;
}
