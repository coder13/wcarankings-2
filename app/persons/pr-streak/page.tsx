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
    personPrStreakRanking: true,
  });
}

export default function PersonPrStreakRankingsPage({
  searchParams,
}: {
  searchParams: Promise<RankingsSearchParams>;
}) {
  return (
    <RankingsPage searchParams={searchParams} requiresPersonPrStreakRankings />
  );
}
