import { RankingRow } from "../RankingRow/RankingRow";
import { rankingEntryKey, type RankingEntry } from "../RankingsExplorer/types";
import type { Key, Ref } from "react";

export type RenderedTableRow = {
  index: number;
  key: Key;
  start: number;
};

export function ResultsTable({
  entries,
  listRef,
  renderedRows,
  renderedListHeight,
  listOffset,
  eventId,
  rankingType,
  hideIdentityIds = false,
  loading,
  showLoading,
  preserveListDuringLoad,
  hasMore,
  loadingMore,
  highlightedPersonId,
  searchMatchPersonIds,
  measureElement,
  onRowNavigate,
  memberSelectionMode,
  selectedMemberIds,
  onMemberToggle,
  onMemberContextMenu,
}: {
  entries: RankingEntry[];
  listRef?: Ref<HTMLOListElement>;
  renderedRows: RenderedTableRow[];
  renderedListHeight: number;
  listOffset: number;
  eventId: string;
  rankingType: "single" | "average";
  hideIdentityIds?: boolean;
  loading: boolean;
  showLoading: boolean;
  preserveListDuringLoad: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  highlightedPersonId: string;
  searchMatchPersonIds?: ReadonlySet<string>;
  measureElement: (element: Element | null) => void;
  onRowNavigate: (rowIndex: number, direction: -1 | 1) => void;
  memberSelectionMode?: boolean;
  selectedMemberIds?: ReadonlySet<string>;
  onMemberToggle?: (personId: string) => void;
  onMemberContextMenu?: (entry: RankingEntry, position: { x: number; y: number }) => void;
}) {
  if (loading && showLoading && !preserveListDuringLoad && entries.length === 0) {
    return <div className="listMessage">Loading rankings…</div>;
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
          content = (
            <RankingRow
              entry={entry}
              eventId={eventId}
              rankingType={rankingType}
              hideIdentityId={hideIdentityIds}
              animationIndex={virtualRow.index}
              searchMatched={searchMatchPersonIds?.has(rankingEntryKey(entry))}
              highlighted={rankingEntryKey(entry) === highlightedPersonId}
              rankIsDuplicate={
                virtualRow.index > 0 &&
                entries[virtualRow.index - 1]?.rank === entry.rank
              }
              rowIndex={virtualRow.index}
              onNavigate={onRowNavigate}
              selectionMode={memberSelectionMode}
              selected={selectedMemberIds?.has(entry.personId)}
              onToggleSelected={onMemberToggle}
              onMemberContextMenu={onMemberContextMenu}
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
            style={{
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
