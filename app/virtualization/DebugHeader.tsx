"use client";

import { MOCK_RANKING_COUNT } from "@/components/VirtualizationPlayground/mockRankings";
import { OVERSCAN, useVirtualizerContext } from "./VirtualizerContext";
import styles from "./VirtualizationPlayground.module.css";

export function DebugHeader() {
  const { items, totalHeight, scrollOffset } = useVirtualizerContext();
  const firstVirtualItem = items[0];
  const lastVirtualItem = items.at(-1);
  const debugInfo = firstVirtualItem && lastVirtualItem
    ? `Rows ${(firstVirtualItem.index + 1).toLocaleString()}–${(
        lastVirtualItem.index + 1
      ).toLocaleString()} · ${items.length} mounted · ${scrollOffset.toLocaleString()}px / ${totalHeight.toLocaleString()}px`
    : `Measuring ${MOCK_RANKING_COUNT.toLocaleString()} rows · overscan ${OVERSCAN}`;

  return (
    <header className={styles.header}>
      <div className={styles.headerContent}>
        <span className={styles.controls}>controls here</span>
        <output className={styles.debugInfo} title={debugInfo}>
          {debugInfo}
        </output>
      </div>
    </header>
  );
}
