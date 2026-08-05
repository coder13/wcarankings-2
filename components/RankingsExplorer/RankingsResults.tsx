"use client";

import { useCallback } from "react";
import { WCA_EVENTS } from "@/lib/wca";
import { ListMembershipRequestRows } from "../ListOwnerControls/ListMembershipRequestRows";
import { LoadingSpinner } from "../LoadingSpinner/LoadingSpinner";
import { ResultsTable } from "../ResultsTable/ResultsTable";
import { useRankingsExplorer } from "./RankingsExplorerContext";
import { emptyOwnerListMessage } from "./list-empty-state";

export function RankingsResults() {
  const {
    config: { list },
    filters,
    rankings,
    search,
    focus,
    listMembers,
  } = useRankingsExplorer();
  const navigateRow = useCallback(
    (globalIndex: number, direction: -1 | 1) => {
      const targetIndex = Math.min(
        rankings.total - 1,
        Math.max(0, globalIndex + direction),
      );
      const selector = `.listItem[data-global-index="${targetIndex}"]`;
      const mounted = document.querySelector<HTMLElement>(selector);
      if (mounted) {
        mounted.focus({ preventScroll: true });
        mounted.scrollIntoView({ block: "nearest" });
        return;
      }
      rankings.jumpToIndex(targetIndex, false);
      let attempts = 4;
      const focusWhenRendered = () => {
        window.requestAnimationFrame(() => {
          const row = document.querySelector<HTMLElement>(selector);
          if (row) {
            row.focus({ preventScroll: true });
            return;
          }
          attempts -= 1;
          if (attempts > 0) focusWhenRendered();
        });
      };
      focusWhenRendered();
    },
    [rankings],
  );
  const membershipRequests = list?.membershipRequests;
  const emptyListMessage = emptyOwnerListMessage(list?.owner);
  const emptyState = (
    <div className="listMessage">
      {emptyListMessage ?? "No rankings match these filters."}
    </div>
  );

  let results;
  if (rankings.error || focus.error) {
    results = (
      <div className="listMessage">{rankings.error || focus.error}</div>
    );
  } else if (rankings.loading && rankings.items.length === 0) {
    results = (
      <div className="listMessage listMessage--initialLoading listMessage--delayed">
        <LoadingSpinner label="Loading rankings" />
      </div>
    );
  } else if (rankings.total === 0) {
    results = emptyState;
  } else {
    results = (
      <ResultsTable
        data={{
          items: rankings.items,
          eventId: filters.eventId,
          rankingType: filters.rankingType,
          emptyState,
          hideIdentityIds:
            filters.subject === "competitions" || filters.subject === "cities",
        }}
        virtualization={{
          totalHeight: rankings.totalHeight,
          listOffset: rankings.listOffset,
        }}
        search={{
          highlightedPersonId: focus.highlightedPersonId,
          searchMatchPersonIds: search.state.matchPersonIds,
        }}
        interaction={{
          onRowNavigate: navigateRow,
          onToggleExpanded: rankings.toggleExpanded,
          memberSelectionMode: listMembers.selection.active,
          selectedMemberIds: listMembers.selection.personIds,
          onMemberToggle: listMembers.selection.toggle,
          onMemberContextMenu: list?.owner
            ? listMembers.contextMenu.open
            : undefined,
          enablePersonDetails:
            filters.subject === "people" &&
            !filters.personCompetitionRanking &&
            !filters.personMedalRanking &&
            WCA_EVENTS.some((event) => event.id === filters.eventId),
          onFocusedPersonChange:
            filters.subject === "people" &&
            !filters.personCompetitionRanking &&
            !filters.personMedalRanking
              ? focus.updateFocusedPerson
              : undefined,
        }}
      />
    );
  }

  return (
    <div className="outerListWrapper" data-rankings-list-container>
      <div className="listContainer">
        {list?.notice && <div className="listMessage">{list.notice}</div>}
        {focus.notice && (
          <div className="listMessage listMessage--notice">{focus.notice}</div>
        )}
        {membershipRequests && (
          <ListMembershipRequestRows
            listId={membershipRequests.listId}
            initialRequests={membershipRequests.requests}
          />
        )}
        {results}
      </div>
    </div>
  );
}
