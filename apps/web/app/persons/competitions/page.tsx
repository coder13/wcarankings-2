import {
  getRankingsPageMetadata,
  RankingsPage,
  type RankingsSearchParams,
} from "@/app/RankingsPage";

export const dynamic = "force-dynamic";

export function generateMetadata({
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
    personActivityMetric: "competitions",
  });
}

export default function PersonCompetitionRankingsPage({
  searchParams,
}: {
  searchParams: Promise<RankingsSearchParams>;
}) {
  return (
    <RankingsPage searchParams={searchParams} requiresPersonActivityRankings />
  );
}
