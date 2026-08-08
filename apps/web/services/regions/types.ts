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
