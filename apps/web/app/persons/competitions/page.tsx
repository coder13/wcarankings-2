import { getRankingsPageMetadata, RankingsPage } from "@/app/RankingsPage";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return getRankingsPageMetadata({
    subject: "people",
    competitionRanking: "best-result",
    cityRanking: "fastest-single",
    year: null,
    personCompetitionRanking: true,
  });
}

export default function PersonCompetitionRankingsPage() {
  return <RankingsPage requiresPersonCompetitionRankings />;
}
