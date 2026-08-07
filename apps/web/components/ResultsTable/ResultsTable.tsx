"use client";

import type { ReactNode } from "react";
import { RankingRow } from "../RankingRow/RankingRow";
import type { RankingEntry } from "../RankingsExplorer/types";
import type { VirtualRankingItem } from "../RankingsExplorer/useVirtualRankings";
import { usePersonRowDetails } from "./usePersonRowDetails";

export type ResultsTableData = {
  items: VirtualRankingItem[];
  eventId: string;
  rankingType: "single" | "average";
  hideIdentityIds?: boolean;
  emptyState?: ReactNode;
};

export type ResultsTableVirtualization = {
  totalHeight: number;
  listOffset: number;
};

export type ResultsTableSearch = {
  highlightedPersonId: string;
  searchMatchPersonIds?: ReadonlySet<string>;
};

export type ResultsTableInteraction = {
  onRowNavigate: (globalIndex: number, direction: -1 | 1) => void;
  onToggleExpanded: (globalIndex: number) => void;
  memberSelectionMode?: boolean;
  selectedMemberIds?: ReadonlySet<string>;
  onMemberToggle?: (personId: string) => void;
  onMemberContextMenu?: (
    entry: RankingEntry,
    position: { x: number; y: number },
  ) => void;
  enablePersonDetails?: boolean;
  onFocusedPersonChange?: (personId: string | null) => void;
};

export function ResultsTable({
  data,
  virtualization,
  search,
  interaction,
}: {
  data: ResultsTableData;
  virtualization: ResultsTableVirtualization;
  search: ResultsTableSearch;
  interaction: ResultsTableInteraction;
}) {
  const {
    items,
    eventId,
    rankingType,
    hideIdentityIds = false,
    emptyState,
  } = data;
  const {
    onRowNavigate,
    onToggleExpanded,
    memberSelectionMode,
    selectedMemberIds,
    onMemberToggle,
    onMemberContextMenu,
    enablePersonDetails = false,
    onFocusedPersonChange,
  } = interaction;
  const activeEntry = items.find((item) => item.expanded)?.entry ?? null;
  const rowDetails = usePersonRowDetails({
    activeEntry,
    eventId,
    enabled: enablePersonDetails,
  });

  if (items.length === 0) {
    return emptyState ?? null;
  }

  return (
    <ol
      className="list"
      data-rankings-list
      style={{ height: `${virtualization.totalHeight}px` }}
    >
      {items.map((virtualRow, mountedIndex) => {
        const entry = virtualRow.entry;
        const accordionVisible = virtualRow.expandedContentHeight > 0;
        const detailsForRow = virtualRow.expanded ? rowDetails.details : null;

        return (
          <div
            className="virtualRow"
            key={virtualRow.key}
            data-index={virtualRow.index}
            data-global-index={virtualRow.globalIndex}
            data-expanded={accordionVisible}
            data-highlighted={entry
              ? entry.personId === search.highlightedPersonId
              : false}
            data-alternate={virtualRow.globalIndex % 2 === 1}
            data-loading={!entry || undefined}
            data-details-loading={Boolean(
              entry && virtualRow.expanded && rowDetails.pending,
            )}
            style={{
              height: `${virtualRow.size}px`,
              transform: `translateY(${
                virtualRow.start - virtualization.listOffset
              }px)`,
            }}
          >
            {entry ? (
              <RankingRow
                entry={entry}
                display={{
                  eventId,
                  rankingType,
                  hideIdentityId: hideIdentityIds,
                  animationIndex: mountedIndex,
                  alternate: virtualRow.globalIndex % 2 === 1,
                  searchMatched: search.searchMatchPersonIds?.has(entry.personId),
                  highlighted: entry.personId === search.highlightedPersonId,
                  rankIsDuplicate: virtualRow.rankIsDuplicate,
                }}
                interaction={{
                  rowIndex: virtualRow.globalIndex,
                  onNavigate: onRowNavigate,
                  selectionMode: memberSelectionMode,
                  selected: selectedMemberIds?.has(entry.personId),
                  onToggleSelected: onMemberToggle,
                  onMemberContextMenu,
                }}
                details={{
                  expanded: virtualRow.expanded,
                  closing: accordionVisible && !virtualRow.expanded,
                  height: virtualRow.expandedContentHeight,
                  progress: virtualRow.expansionProgress,
                  eventDetails: detailsForRow,
                  onPrefetchDetails: enablePersonDetails
                    ? rowDetails.prefetch
                    : undefined,
                  onCancelPrefetchDetails: enablePersonDetails
                    ? rowDetails.cancelPrefetch
                    : undefined,
                  detailsError: virtualRow.expanded ? rowDetails.error : "",
                  onToggle: enablePersonDetails && !memberSelectionMode
                    ? () => {
                        onToggleExpanded(virtualRow.globalIndex);
                        onFocusedPersonChange?.(
                          virtualRow.expanded ? null : entry.personId,
                        );
                      }
                    : undefined,
                }}
              />
            ) : (
              <div
                className={`row row--loading${
                  virtualRow.globalIndex % 2 === 1 ? " row--alternate" : ""
                }`}
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}
    </ol>
  );
}
