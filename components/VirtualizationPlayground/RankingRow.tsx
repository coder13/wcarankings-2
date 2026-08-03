import type { CSSProperties } from "react";
import styles from "./RankingRow.module.css";

export function RankingRow({
  number,
  name,
  result,
  alternate = false,
  style,
}: {
  number: number;
  name: string;
  result: string;
  alternate?: boolean;
  style?: CSSProperties;
}) {
  return (
    <li
      className={`${styles.row}${alternate ? ` ${styles.alternate}` : ""}`}
      style={style}
    >
      <span className={styles.number}>{number.toLocaleString()}</span>
      <span className={styles.name}>{name}</span>
      <span className={styles.result}>{result}</span>
    </li>
  );
}
