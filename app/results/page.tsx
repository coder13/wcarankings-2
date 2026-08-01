import { RankingsPage } from "@/app/RankingsPage";

export const dynamic = "force-dynamic";

export default function ResultsPage() {
  return <RankingsPage requiresResultRankings />;
}
