"use client";

import { RESULTS_PAGE_SIZE } from "@/lib/rankings-config";
import { JumpControlsVisibility } from "../JumpControlsVisibility/JumpControlsVisibility";
import { RankingsPagerRail } from "../RankingsRail/RankingsRail";
import { useRankingsExplorer } from "./RankingsExplorerContext";
import { formatFooterDate, formatRankingsFreshness } from "./types";

function RankingsFooter({ standalone = false }: { standalone?: boolean }) {
  const {
    config: { release },
    rankings,
  } = useRankingsExplorer();
  const { offlineStale, exportDate } = rankings;

  return (
    <footer
      className={`siteFooter${standalone ? " siteFooter--standalone" : ""}`}
    >
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

export function RankingsNavigationFooter() {
  const {
    config: { source, options },
    filters,
    rankings,
    search,
    focus,
    listMembers,
    navigation,
    hasScrolled,
  } = useRankingsExplorer();
  const pagerEnabled =
    !listMembers.selection.active &&
    (!source || rankings.total > RESULTS_PAGE_SIZE);

  if (!pagerEnabled) return <RankingsFooter standalone />;

  return (
    <JumpControlsVisibility
      visible={rankings.jumpAnimating || hasScrolled}
      fallback={<RankingsFooter />}
    >
      <RankingsPagerRail
        navigation={{
          busy: rankings.jumpAnimating,
          currentPosition: rankings.currentIndex + 1,
          total: rankings.total,
          onJumpUp: navigation.up,
          onJumpDown: navigation.down,
          onJumpToTop: navigation.toTop,
          onJumpToEnd: navigation.toEnd,
          onFocusMe:
            filters.subject === "people" &&
            !filters.personActivityRanking &&
            options.showMyRank
              ? focus.focusMyRanking
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
