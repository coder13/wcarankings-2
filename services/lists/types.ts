import type { RegionScope } from "@/lib/wca";

export type ListVisibility = "public" | "private";
export type ListJoinPolicy = "open" | "closed";
type ListKind = "user" | "system";
export type ListMembershipState = "member" | "pending" | "not_member";

type ListOwnerSummary = { id: number; name: string; wcaId: string };

export type ListSummary = {
  id: number;
  publicId: string | null;
  systemAlias: string | null;
  kind: ListKind;
  name: string;
  slug: string;
  description: string | null;
  visibility: ListVisibility;
  joinPolicy: ListJoinPolicy;
  memberCount: number;
  membershipVersion: number;
  systemDefinitionVersion: number | null;
  owner: ListOwnerSummary | null;
  createdAt: string;
  updatedAt: string;
};

export type ListRow = {
  id: number;
  public_id: string | null;
  system_alias: string | null;
  kind: ListKind;
  owner_user_id: number | null;
  owner_name: string | null;
  owner_wca_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  visibility: ListVisibility;
  join_policy: ListJoinPolicy;
  member_count: number;
  membership_version: number;
  system_definition_version: number | null;
  created_at: string;
  updated_at: string;
};

export type MemberRow = {
  person_id: string;
  person_name: string | null;
  country_id: string | null;
  source: "owner" | "self_request" | "bulk_import" | "system_rule";
  created_at: string;
};

export type RequestRow = {
  id: number;
  list_id: number;
  requester_user_id: number;
  person_id: string;
  requester_name: string;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  created_at: string;
  resolved_at: string | null;
};

export type PublicListSummary = Pick<
  ListSummary,
  "publicId" | "systemAlias" | "slug" | "name" | "memberCount" | "kind"
> & { createdBy: string | null };

type ListRegion = { id: string; name: string };
type ListCountryRegion = ListRegion & { iso2: string };
export type ListRegions = {
  continents: ListRegion[];
  countries: ListCountryRegion[];
};

export type ListRegionRow = {
  country_id: string;
  country_name: string;
  country_iso2: string;
  continent_id: string;
};

export type ListRankingRow = {
  rank: number;
  sub_rank: number;
  total: number;
  person_id: string;
  person_name: string;
  country_id: string;
  country_name: string;
  country_iso2: string;
  continent_id: string;
  best: number;
  competition_id: string;
  competition_name: string;
  is_world_record: number;
  is_continent_record: number;
  is_country_record: number;
};

export type ScopedRankingSource = {
  from: (rankingTable: string) => string;
  conditions: string[];
  values: unknown[];
};

export type ListRouteContext = { params: Promise<{ listId: string }> };
export type ListMemberRouteContext = {
  params: Promise<{ listId: string; personId: string }>;
};
export type MembershipDecisionRouteContext = {
  params: Promise<{ listId: string; requestId: string }>;
};
export type ListRegionSelection = { scope: RegionScope; regionId: string };

export type ListLookupQueryInput = {
  listColumns: string;
  byPublicId: boolean;
  forUpdate?: boolean;
};
