import type { RowDataPacket } from "mysql2/promise";

export interface ListRankingTarget {
  id: number;
  kind: string;
  membershipVersion: number;
}

export interface ListRow extends RowDataPacket {
  id: number | string;
  membership_version: number | string;
  system_definition_version: number | string;
  visibility: "public" | "private";
}

export interface PersonIdRow extends RowDataPacket {
  person_id: string;
}

export interface ExportDataVersionRow extends RowDataPacket {
  value: string;
}

export interface RoleListDefinition {
  alias: string;
  description: string | null;
  key: string;
  name: string;
  rolesUrl: string;
  version: number;
}

interface WcaRoleUser {
  wca_id?: unknown;
}

export interface WcaRole {
  user?: WcaRoleUser;
}
