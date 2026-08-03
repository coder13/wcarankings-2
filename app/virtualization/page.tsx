import { DebugHeader } from "./DebugHeader";
import { VirtualRankingsProvider } from "./VirtualizerContext";
import { VirtualRankingsTable } from "./VirtualRankingsTable";
import styles from "./VirtualizationPlayground.module.css";

export default function VirtualizationPlaygroundPage() {
  return (
    <VirtualRankingsProvider>
      <div className={styles.page}>
        <DebugHeader />
        <main>
          <VirtualRankingsTable />
        </main>
      </div>
    </VirtualRankingsProvider>
  );
}
