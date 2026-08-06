import { getRankingsPageMetadata, RankingsPage } from "@/app/RankingsPage";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return getRankingsPageMetadata({
    subject: "competitions",
    competitionRanking: "latitude",
    cityRanking: "fastest-single",
    year: null,
    personCompetitionRanking: false,
  });
}

export default function CompetitionLatitudePage() {
  return <RankingsPage requiresCompetitionRankings />;
}
