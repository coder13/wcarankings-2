"use client";

import { RankingRow } from "../RankingRow/RankingRow";
import { rankingEntryKey, type RankingEntry } from "../RankingsExplorer/types";
import type { Key, Ref } from "react";
import { usePersonRowDetails } from "./usePersonRowDetails";

type RenderedTableRow = {
  index: number;
  key: Key;
  start: number;
  size?: number;
};

export type ResultsTableData = {
  entries: RankingEntry[];
  eventId: string;
  rankingType: "single" | "average";
  hideIdentityIds?: boolean;
  hasMore: boolean;
};

export type ResultsTableVirtualization = {
  listRef?: Ref<HTMLOListElement>;
  renderedRows: RenderedTableRow[];
  renderedListHeight: number;
  listOffset: number;
  measureElement: (element: Element | null) => void;
  resizeRow?: (index: number, size: number) => void;
};

export type ResultsTableStatus = {
  loading: boolean;
  preserveListDuringLoad: boolean;
  loadingMore: boolean;
};

export type ResultsTableSearch = {
  highlightedPersonId: string;
  searchMatchPersonIds?: ReadonlySet<string>;
};

export type ResultsTableInteraction = {
  onRowNavigate: (rowIndex: number, direction: -1 | 1) => void;
  memberSelectionMode?: boolean;
  selectedMemberIds?: ReadonlySet<string>;
  onMemberToggle?: (personId: string) => void;
  onMemberContextMenu?: (entry: RankingEntry, position: { x: number; y: number }) => void;
  enablePersonDetails?: boolean;
  initialExpandedPersonId?: string;
  onFocusedPersonChange?: (personId: string | null) => void;
};

export function ResultsTable({
  data,
  virtualization,
  status,
  search,
  interaction,
}: {
  data: ResultsTableData;
  virtualization: ResultsTableVirtualization;
  status: ResultsTableStatus;
  search: ResultsTableSearch;
  interaction: ResultsTableInteraction;
}) {
  const {
    entries,
    eventId,
    rankingType,
    hideIdentityIds = false,
    hasMore,
  } = data;
  const {
    listRef,
    renderedRows,
    renderedListHeight,
    listOffset,
    measureElement,
    resizeRow,
  } = virtualization;
  const { loading, preserveListDuringLoad, loadingMore } = status;
  const { highlightedPersonId, searchMatchPersonIds } = search;
  const {
    onRowNavigate,
    memberSelectionMode,
    selectedMemberIds,
    onMemberToggle,
    onMemberContextMenu,
    enablePersonDetails = false,
    initialExpandedPersonId = "",
    onFocusedPersonChange,
  } = interaction;
  const rowDetails = usePersonRowDetails({
    entries,
    eventId,
    rankingType,
    enabled: enablePersonDetails,
    initialExpandedPersonId,
    onFocusedPersonChange,
    resizeRow,
  });

  if (loading && !preserveListDuringLoad && entries.length === 0) {
    return <div className="listMessage listMessage--delayed">Loading rankings…</div>;
  }

  return (
    <ol
      ref={listRef}
      className="list"
      style={{ height: `${renderedListHeight}px` }}
    >
      {renderedRows.map((virtualRow) => {
        const entry = entries[virtualRow.index] ?? null;
        let content;

        if (entry) {
          const key = rankingEntryKey(entry);
          content = (
            <RankingRow
              entry={entry}
              display={{
                eventId,
                rankingType,
                hideIdentityId: hideIdentityIds,
                animationIndex: virtualRow.index,
                searchMatched: searchMatchPersonIds?.has(entry.personId),
                highlighted: entry.personId === highlightedPersonId,
                rankIsDuplicate:
                  virtualRow.index > 0 &&
                  entries[virtualRow.index - 1]?.rank === entry.rank,
              }}
              interaction={{
                rowIndex: virtualRow.index,
                onNavigate: onRowNavigate,
                selectionMode: memberSelectionMode,
                selected: selectedMemberIds?.has(entry.personId),
                onToggleSelected: onMemberToggle,
                onMemberContextMenu,
              }}
              details={{
                expanded: rowDetails.activeExpandedKey === key,
                closing: rowDetails.closingKeys.has(key),
                skipAccordionAnimation: Boolean(
                  initialExpandedPersonId &&
                  rowDetails.focusedExpansionKey === key
                ),
                eventDetails: key === rowDetails.activeExpandedKey
                  ? rowDetails.details
                  : null,
                onPrefetchDetails: enablePersonDetails
                  ? rowDetails.prefetch
                  : undefined,
                onCancelPrefetchDetails: enablePersonDetails
                  ? rowDetails.cancelPrefetch
                  : undefined,
                detailsError: key === rowDetails.activeExpandedKey
                  ? rowDetails.error
                  : "",
                onToggle: enablePersonDetails && !memberSelectionMode
                  ? () => rowDetails.toggle(entry)
                  : undefined,
              }}
            />
          );
        } else if (hasMore) {
          content = (
            <div className="listMessage">
              {loadingMore ? "Loading more results…" : "Keep scrolling…"}
            </div>
          );
        } else {
          content = <div className="listMessage">That’s all, folks</div>;
        }

        return (
          <div
            ref={measureElement}
            className="virtualRow"
            key={virtualRow.key}
            data-index={virtualRow.index}
            data-expanded={entry
              ? rowDetails.activeExpandedKey === rankingEntryKey(entry) ||
                rowDetails.closingKeys.has(rankingEntryKey(entry))
              : false}
            data-highlighted={entry ? entry.personId === highlightedPersonId : false}
            data-alternate={entry ? virtualRow.index % 2 === 1 : false}
            data-accordion-measure-lock={entry && rowDetails.animatedKeys.has(rankingEntryKey(entry)) ? "true" : undefined}
            data-details-loading={entry
              ? rowDetails.pending &&
                rowDetails.activeExpandedKey === rankingEntryKey(entry)
              : false}
            style={{
              height: virtualRow.size === undefined ? undefined : `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start - listOffset}px)`,
            }}
          >
            {content}
          </div>
        );
      })}
    </ol>
  );
}
