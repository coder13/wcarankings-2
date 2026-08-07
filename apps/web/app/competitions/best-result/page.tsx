import { getRankingsPageMetadata, RankingsPage } from "@/app/RankingsPage";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return getRankingsPageMetadata({
    subject: "competitions",
    competitionRanking: "best-result",
    cityRanking: "fastest-single",
    year: null,
    personCompetitionRanking: false,
  });
}

export default function CompetitionBestResultPage() {
  return <RankingsPage requiresCompetitionRankings />;
}
