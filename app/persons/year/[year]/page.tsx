import { notFound } from "next/navigation";
import {
  RankingsPage,
  type RankingsSearchParams,
} from "@/app/RankingsPage";

export const dynamic = "force-dynamic";

export default async function YearlyPersonsPage({
  params,
  searchParams,
}: {
  params: Promise<{ year: string }>;
  searchParams: Promise<RankingsSearchParams>;
}) {
  const { year } = await params;
  if (!/^\d{4}$/.test(year)) notFound();
  return (
    <RankingsPage
      searchParams={searchParams}
      requiresYearlyRankings
    />
  );
}
