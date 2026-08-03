"use client";

import { WCA_EVENTS } from "@/lib/wca";
import { ListMembershipRequestRows } from "../ListOwnerControls/ListMembershipRequestRows";
import { ResultsTable } from "../ResultsTable/ResultsTable";
import { useRankingsExplorer } from "./RankingsExplorerContext";
import { emptyOwnerListMessage } from "./list-empty-state";

export function RankingsResults() {
  const {
    config: { list },
    filters,
    data: { rankings, listMembers },
    interactions,
  } = useRankingsExplorer();
  const membershipRequests = list?.membershipRequests;
  const emptyListMessage = emptyOwnerListMessage(list?.owner);
  const emptyState = (
    <div className="listMessage">
      {emptyListMessage ?? "No rankings match these filters."}
    </div>
  );

  let results;
  if (rankings.error || interactions.navigation.error) {
    results = (
      <div className="listMessage">
        {rankings.error || interactions.navigation.error}
      </div>
    );
  } else if (rankings.loading && rankings.items.length === 0) {
    results = (
      <div className="listMessage listMessage--delayed">Loading rankings…</div>
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
          highlightedPersonId: interactions.navigation.highlightedPersonId,
          searchMatchPersonIds: interactions.search.state.matchPersonIds,
        }}
        interaction={{
          onRowNavigate: interactions.navigation.navigateRow,
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
            WCA_EVENTS.some((event) => event.id === filters.eventId),
          onFocusedPersonChange:
            filters.subject === "people" && !filters.personCompetitionRanking
              ? interactions.navigation.updateFocusedPerson
              : undefined,
        }}
      />
    );
  }

  return (
    <div className="outerListWrapper" data-rankings-list-container>
      <div className="listContainer">
        {list?.notice && <div className="listMessage">{list.notice}</div>}
        {interactions.navigation.focusNotice && (
          <div className="listMessage listMessage--notice">
            {interactions.navigation.focusNotice}
          </div>
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
