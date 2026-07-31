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
