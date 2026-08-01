"use client";

import { RESULTS_PAGE_SIZE } from "@/lib/rankings-config";
import { JumpControlsVisibility } from "../JumpControlsVisibility/JumpControlsVisibility";
import { RankingsPagerRail } from "../RankingsRail/RankingsRail";
import { useRankingsExplorer } from "./RankingsExplorerContext";
import { useHasScrolled } from "./useRailScrollProgress";
import { formatFooterDate, formatRankingsFreshness } from "./types";

function RankingsFooter({ standalone = false }: { standalone?: boolean }) {
  const { config: { release }, data } = useRankingsExplorer();
  const { offlineStale, exportDate } = data.window.state;

  return (
    <footer className={`siteFooter${standalone ? " siteFooter--standalone" : ""}`}>
      <span>By Adam Walker and Cailyn Sinclair</span>
      {offlineStale && (
        <span role="status">Offline cached rankings may be stale</span>
      )}
      <span>
        {release
          ? `${formatFooterDate(release.lastResultIngestAt ?? exportDate)} • ${
              release.commitSha === "development" ||
              release.commitSha === "unknown"
                ? release.commitSha
                : release.commitSha.slice(0, 7)
            }`
          : formatRankingsFreshness(exportDate)}
      </span>
    </footer>
  );
}

export function RankingsNavigationFooter({ visibleRank }: { visibleRank: number }) {
  const {
    config: { source, options },
    filters,
    data,
    interactions: { navigation, search },
  } = useRankingsExplorer();
  const hasScrolled = useHasScrolled();
  const pagerEnabled =
    !data.listMembers.selection.active &&
    (!source || data.window.state.total > RESULTS_PAGE_SIZE);

  if (!pagerEnabled) return <RankingsFooter standalone />;

  return (
    <JumpControlsVisibility
      visible={data.window.state.pagerNavigationBusy || hasScrolled}
      fallback={<RankingsFooter />}
    >
      <RankingsPagerRail
        navigation={{
          busy: data.window.state.pagerNavigationBusy,
          currentPosition: visibleRank,
          total: data.window.state.total,
          onJumpUp: navigation.jumpUp,
          onJumpDown: navigation.jumpDown,
          onFocusMe: filters.subject === "people" && options.showMyRank
            ? navigation.focusMyRanking
            : undefined,
        }}
        search={{
          active: search.state.open && search.state.matches.length > 0,
          onPrevious: () => search.actions.cycle(-1),
          onNext: () => search.actions.cycle(1),
        }}
      />
    </JumpControlsVisibility>
  );
}
