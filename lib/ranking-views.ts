export const RANKING_VIEWS = ["wca", "kinch", "sor"] as const;

export type RankingView = (typeof RANKING_VIEWS)[number];
export type MatrixRankingView = Exclude<RankingView, "wca">;

export function isRankingView(value: string | null): value is RankingView {
  return RANKING_VIEWS.includes(value as RankingView);
}

export function parseRankingView(value: string | null): RankingView {
  return value === "kinch" || value === "sor" ? value : "wca";
}

export function isMatrixRankingView(value: string): value is MatrixRankingView {
  return value === "kinch" || value === "sor";
}

export function rankingViewPath(view: RankingView) {
  return view === "wca" ? "/" : `/${view}`;
}

export function rankingViewLabel(view: RankingView) {
  if (view === "kinch") return "Kinch Rankings";
  if (view === "sor") return "Sum of Ranks";
  return "WCA Rankings";
}
