import type { CSSProperties } from "react";
import styles from "./RankingRow.module.css";

type RankingRowExpansion = {
  expanded: boolean;
  height: number;
  fullHeight: number;
  progress: number;
  onToggle: () => void;
};

export function RankingRow({
  number,
  name,
  result,
  alternate = false,
  expansion,
  style,
}: {
  number: number;
  name: string;
  result: string;
  alternate?: boolean;
  expansion?: RankingRowExpansion;
  style?: CSSProperties;
}) {
  return (
    <li
      className={`${styles.row}${alternate ? ` ${styles.alternate}` : ""}`}
      style={style}
    >
      <button
        aria-expanded={expansion?.expanded ?? false}
        className={styles.rowHeader}
        onClick={expansion?.onToggle}
        type="button"
      >
        <span className={styles.number}>{number.toLocaleString()}</span>
        <span className={styles.name}>{name}</span>
        <span className={styles.result}>{result}</span>
      </button>
      {expansion && (
        <div
          aria-hidden={!expansion.expanded}
          className={styles.details}
          style={{
            height: `${expansion.height}px`,
            opacity: expansion.progress,
          }}
        >
          <div
            className={styles.detailsInner}
            style={{ height: `${expansion.fullHeight}px` }}
          >
            <div>
              <span className={styles.detailsLabel}>Single</span>
              <span className={styles.detailsValue}>{result}</span>
              <span className={styles.detailsMeta}>
                World ranking #{number.toLocaleString()}
              </span>
            </div>
            <div>
              <span className={styles.detailsLabel}>Average</span>
              <span className={styles.detailsValue}>Mock average</span>
              <span className={styles.detailsMeta}>
                Fixed-height competitor details
              </span>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}
