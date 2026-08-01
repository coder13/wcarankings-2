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
