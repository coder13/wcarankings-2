import { DebugHeader } from "./DebugHeader";
import { MockRankingsApiProvider } from "./RankingsApiContext";
import {
  TOTAL_ROWS,
  VirtualRankingsProvider,
} from "./VirtualizerContext";
import { VirtualRankingsTable } from "./VirtualRankingsTable";
import styles from "./VirtualizationPlayground.module.css";

export default function VirtualizationPlaygroundPage() {
  return (
    <MockRankingsApiProvider totalRows={TOTAL_ROWS}>
      <VirtualRankingsProvider>
        <div className={styles.page} id="virtualization-playground">
          <DebugHeader />
          <main>
            <VirtualRankingsTable />
          </main>
        </div>
      </VirtualRankingsProvider>
    </MockRankingsApiProvider>
  );
}
