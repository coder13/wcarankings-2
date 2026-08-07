import {
  getRankingsPageMetadata,
  RankingsPage,
  type RankingsSearchParams,
} from "@/app/RankingsPage";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<RankingsSearchParams>;
}) {
  return getRankingsPageMetadata({
    searchParams,
    subject: "competitions",
    competitionRanking: "podiums",
    cityRanking: "fastest-single",
    year: null,
    personCompetitionRanking: false,
  });
}

export default function CompetitionPodiumsPage({
  searchParams,
}: {
  searchParams: Promise<RankingsSearchParams>;
}) {
  return (
    <RankingsPage searchParams={searchParams} requiresCompetitionRankings />
  );
}
