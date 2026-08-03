"use client";

import { RankingRow } from "@/components/VirtualizationPlayground/RankingRow";
import {
  EXPANDED_ROW_HEIGHT,
  LIST_OFFSET,
  ROW_HEIGHT,
  useVirtualizerContext,
} from "./VirtualizerContext";
import styles from "./VirtualizationPlayground.module.css";

export function VirtualRankingsTable() {
  const { items, totalHeight, toggleExpanded } = useVirtualizerContext();

  return (
    <ol className={styles.list} style={{ height: `${totalHeight}px` }}>
      {items.map((virtualRow) => {
        const { globalIndex, ranking } = virtualRow;

        return (
          <RankingRow
            key={virtualRow.key}
            number={ranking.number}
            name={ranking.name}
            result={ranking.result}
            alternate={globalIndex % 2 === 1}
            expansion={{
              expanded: virtualRow.expanded,
              height: virtualRow.detailsHeight,
              fullHeight: EXPANDED_ROW_HEIGHT - ROW_HEIGHT,
              progress: virtualRow.expansionProgress,
              onToggle: () => toggleExpanded(globalIndex),
            }}
            style={{
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start - LIST_OFFSET}px)`,
            }}
          />
        );
      })}
    </ol>
  );
}
