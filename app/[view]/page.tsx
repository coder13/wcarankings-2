import { notFound } from "next/navigation";
import { MatrixPage } from "@/components/MatrixExplorer/MatrixPage";
import { isMatrixRankingView } from "@/lib/ranking-views";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function RankingViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ view: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { view } = await params;
  if (!isMatrixRankingView(view)) notFound();
  return <MatrixPage view={view} searchParams={searchParams} />;
}
