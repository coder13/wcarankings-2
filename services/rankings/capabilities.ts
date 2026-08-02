import { RANKING_ENTRY_ENHANCEMENTS_ENABLED } from "@/lib/ranking-entry-enhancements";
import type { RankingEntryEnhancements } from "@/services/rankings/helpers";

// This is deliberately a server-side companion to the shared UI flag. Avoid a
// schema probe: old candidate tables must not accidentally re-enable the UI.
export async function getRankingEntryEnhancements(): Promise<RankingEntryEnhancements> {
  return { rankDeltas: RANKING_ENTRY_ENHANCEMENTS_ENABLED };
}
