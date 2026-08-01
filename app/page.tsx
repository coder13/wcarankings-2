import {
  RankingsPage,
  type RankingsSearchParams,
} from "@/app/RankingsPage";

export const dynamic = "force-dynamic";

export default function Home({
  searchParams,
}: {
  searchParams: Promise<RankingsSearchParams>;
}) {
  return <RankingsPage searchParams={searchParams} />;
}
