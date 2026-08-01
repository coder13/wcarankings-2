"use client";

import { WCA_EVENTS } from "@/lib/wca";
import { ListMembershipRequestRows } from "../ListOwnerControls/ListMembershipRequestRows";
import { ResultsTable } from "../ResultsTable/ResultsTable";
import { useRankingsExplorer } from "./RankingsExplorerContext";
import type { RankingViewportRendering } from "./useRankingViewport";

export function RankingsResults({
  viewport: {
    containerRef,
    listRef,
    renderedRows,
    renderedListHeight,
    measureElement,
    resizeRow,
  },
}: {
  viewport: RankingViewportRendering;
}) {
  const {
    config: { list },
    filters,
    data,
    interactions,
  } = useRankingsExplorer();
  const { state: ranking } = data.window;
  const { listMembers } = data;
  const membershipRequests = list?.membershipRequests;

  let results = null;
  if (ranking.error) {
    results = <div className="listMessage">{ranking.error}</div>;
  } else {
    results = (
      <ResultsTable
        data={{
          entries: ranking.entries,
          eventId: filters.eventId,
          rankingType: ranking.entriesRankingType,
          hideIdentityIds: filters.subject === "competitions",
          hasMore: ranking.hasMore,
        }}
        virtualization={{
          listRef,
          renderedRows,
          renderedListHeight,
          listOffset: ranking.listOffset,
          measureElement,
          resizeRow,
        }}
        status={{
          loading: ranking.loading,
          preserveListDuringLoad: ranking.preserveListDuringLoad,
          loadingMore: ranking.loadingMore,
        }}
        search={{
          highlightedPersonId: ranking.highlightedPersonId,
          searchMatchPersonIds: interactions.search.state.matchPersonIds,
        }}
        interaction={{
          onRowNavigate: data.pagination.navigateRow,
          memberSelectionMode: listMembers.selection.active,
          selectedMemberIds: listMembers.selection.personIds,
          onMemberToggle: listMembers.selection.toggle,
          onMemberContextMenu: list?.owner
            ? listMembers.contextMenu.open
            : undefined,
          enablePersonDetails:
            filters.subject === "people" &&
            WCA_EVENTS.some((event) => event.id === filters.eventId),
          initialExpandedPersonId:
            filters.subject === "people"
              ? ranking.focusedExpandedPersonId
              : "",
          onFocusedPersonChange:
            filters.subject === "people"
              ? interactions.navigation.updateFocusedPerson
              : undefined,
        }}
      />
    );
  }

  return (
    <div className="outerListWrapper" ref={containerRef}>
      <div className="listContainer">
        {list?.notice && (
          <div className="listMessage">{list.notice}</div>
        )}
        {ranking.focusNotice && (
          <div className="listMessage listMessage--notice">
            {ranking.focusNotice}
          </div>
        )}
        {membershipRequests && (
          <ListMembershipRequestRows
            listId={membershipRequests.listId}
            initialRequests={membershipRequests.requests}
          />
        )}
        {ranking.loadingPrevious && (
          <div className="listMessage">Loading earlier rankings…</div>
        )}
        {results}
      </div>
    </div>
  );
}
