"use client";

import { RankingRow } from "@/components/VirtualizationPlayground/RankingRow";
import { getMockRanking } from "@/components/VirtualizationPlayground/mockRankings";
import { LIST_OFFSET, useVirtualizerContext } from "./VirtualizerContext";
import styles from "./VirtualizationPlayground.module.css";

export function VirtualRankingsTable() {
  const { items, totalHeight } = useVirtualizerContext();

  return (
    <ol className={styles.list} style={{ height: `${totalHeight}px` }}>
      {items.map((virtualRow) => {
        const ranking = getMockRanking(virtualRow.index);

        return (
          <RankingRow
            key={virtualRow.key}
            number={ranking.number}
            name={ranking.name}
            result={ranking.result}
            alternate={virtualRow.index % 2 === 1}
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
