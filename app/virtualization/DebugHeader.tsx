"use client";

import { useState } from "react";
import { useMockApiControls } from "./RankingsApiContext";
import {
  OVERSCAN_ROWS,
  TOTAL_ROWS,
  WINDOW_ROWS,
  useVirtualizerContext,
} from "./VirtualizerContext";
import styles from "./VirtualizationPlayground.module.css";

export function DebugHeader() {
  const [jumpRank, setJumpRank] = useState(5_000);
  const {
    averageDelayMs,
    varianceMs,
    setAverageDelayMs,
    setVarianceMs,
  } = useMockApiControls();
  const { items, totalHeight, scrollOffset, baseIndex, jumpToIndex } =
    useVirtualizerContext();
  const firstVirtualItem = items[0];
  const lastVirtualItem = items.at(-1);
  const debugInfo = firstVirtualItem && lastVirtualItem
    ? `Rows ${(firstVirtualItem.globalIndex + 1).toLocaleString()}–${(
        lastVirtualItem.globalIndex + 1
      ).toLocaleString()} · base ${(baseIndex + 1).toLocaleString()} · ${WINDOW_ROWS.toLocaleString()} window · ${items.length} mounted · ${scrollOffset.toLocaleString()}px / ${totalHeight.toLocaleString()}px`
    : `Measuring ${TOTAL_ROWS.toLocaleString()} rows · ${WINDOW_ROWS.toLocaleString()}-row window · overscan ${OVERSCAN_ROWS}`;
  const minimumDelayMs = Math.max(0, averageDelayMs - varianceMs);
  const maximumDelayMs = averageDelayMs + varianceMs;

  return (
    <header className={styles.header}>
      <div className={styles.headerContent}>
        <div
          className={styles.controls}
          title={`Mock requests take ${minimumDelayMs}–${maximumDelayMs}ms`}
        >
          <label className={styles.delayControl}>
            <input
              aria-label="Average API delay in milliseconds"
              inputMode="numeric"
              min="0"
              onChange={(event) =>
                setAverageDelayMs(
                  Math.max(0, event.currentTarget.valueAsNumber || 0),
                )
              }
              step="50"
              type="number"
              value={averageDelayMs}
            />
            <span>ms</span>
          </label>
          <span>+/-</span>
          <label className={styles.delayControl}>
            <input
              aria-label="API delay variance in milliseconds"
              inputMode="numeric"
              min="0"
              onChange={(event) =>
                setVarianceMs(
                  Math.max(0, event.currentTarget.valueAsNumber || 0),
                )
              }
              step="50"
              type="number"
              value={varianceMs}
            />
            <span>ms</span>
          </label>
        </div>
        <form
          className={styles.jumpControl}
          onSubmit={(event) => {
            event.preventDefault();
            jumpToIndex(jumpRank - 1);
          }}
        >
          <input
            aria-label="Ranking to jump to"
            inputMode="numeric"
            max={TOTAL_ROWS}
            min="1"
            onChange={(event) =>
              setJumpRank(
                Math.min(
                  TOTAL_ROWS,
                  Math.max(1, event.currentTarget.valueAsNumber || 1),
                ),
              )
            }
            step="1"
            type="number"
            value={jumpRank}
          />
          <button type="submit">Jump</button>
        </form>
        <output className={styles.debugInfo} title={debugInfo}>
          {debugInfo}
        </output>
      </div>
    </header>
  );
}
