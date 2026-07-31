export type WcaAvatar = {
  thumb_url?: string;
  url?: string;
  is_default?: boolean;
};

export type WcaPersonSearchResult = {
  wca_id?: string;
  class?: string;
  avatar?: WcaAvatar;
};

export type WcaPersonSearchResponse = {
  result?: WcaPersonSearchResult[];
};

export type WcaPersonResponse = {
  person?: {
    avatar?: WcaAvatar;
  };
};

export type WcaMeResponse = {
  me?: {
    wca_id?: string;
    name?: string;
    country_iso2?: string;
    avatar?: WcaAvatar;
  };
};

export type WcaOAuthTokenResponse = {
  access_token?: string;
};

export type WcaCountry = {
  id: string;
  name: string;
  iso2?: string;
};

export type PersonSearchDatabaseInput = {
  search: string;
  regexSearch: boolean;
  limit: number;
  offset: number;
};

export type PersonSearchRow = {
  wca_id: string;
  name: string;
  country_id: string;
  country_name: string;
  country_iso2: string;
  avatar_url: string | null;
  competition_count: number;
  total_count: number;
};

export type PersonIdSearchInput = {
  search: string;
  regexSearch: boolean;
  limit: number;
};

export type PersonIdRow = {
  wca_id: string;
};

export type RegionKind = "continent" | "country";

export type RegionRecord = {
  id: string;
  name: string;
  iso2?: string;
};

export type RankingRegionRow = {
  id: string;
  name: string;
  iso2: string;
};
