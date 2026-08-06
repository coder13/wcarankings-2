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
    subject: "people",
    competitionRanking: "best-result",
    cityRanking: "fastest-single",
    year: null,
    personCompetitionRanking: false,
    personActivityRanking: true,
    personActivityMetric: "rounds",
  });
}

export default function PersonRoundRankingsPage({
  searchParams,
}: {
  searchParams: Promise<RankingsSearchParams>;
}) {
  return (
    <RankingsPage searchParams={searchParams} requiresPersonActivityRankings />
  );
}
