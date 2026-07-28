"use client";

import Link from "next/link";
import { rankingViewPath, type RankingView } from "@/lib/ranking-views";
import type { RankingType } from "@/lib/wca";
import type { RegionSelection } from "../RankingsExplorer/types";

function hrefFor(
  view: RankingView,
  rankingType: RankingType,
  region: RegionSelection,
) {
  const params = new URLSearchParams();
  if (rankingType !== "single") params.set("result", rankingType);
  if (region.scope !== "world") params.set("region", region.regionId);
  const query = params.toString();
  const path = rankingViewPath(view);
  return query ? `${path}?${query}` : path;
}

export function ViewSwitcher({
  view,
  rankingType,
  region,
}: {
  view: RankingView;
  rankingType: RankingType;
  region: RegionSelection;
}) {
  const options: Array<{ view: RankingView; label: string }> = [
    { view: "wca", label: "Rankings" },
    { view: "kinch", label: "Kinch" },
    { view: "sor", label: "Sum of Ranks" },
  ];

  return (
    <nav className="viewSwitcher" aria-label="Ranking view">
      <span className="viewSwitcherLabel">Explore</span>
      {options.map((option) => (
        <Link
          aria-current={option.view === view ? "page" : undefined}
          className={option.view === view ? "isSelected" : undefined}
          href={hrefFor(option.view, rankingType, region)}
          key={option.view}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}
