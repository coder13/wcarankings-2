export type WcaProfile = {
  wcaId: string;
  name: string;
  countryIso2: string;
  avatarUrl: string | null;
};

export type AuthUser = {
  id: number;
  wcaId: string;
  name: string;
  countryIso2: string;
  avatarUrl: string | null;
  allowListInclusion: boolean;
};

export type AuthUserRow = RowDataPacket & {
  id: number;
  wca_id: string;
  name: string;
  country_iso2: string;
  avatar_url: string | null;
  allow_list_inclusion: number;
};
import type { RowDataPacket } from "mysql2/promise";
