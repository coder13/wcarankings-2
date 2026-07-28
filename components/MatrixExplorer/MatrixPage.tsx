import { redirect } from "next/navigation";
import { getRegions } from "@/lib/regions";
import { loadRankingMatrix } from "@/lib/ranking-matrix";
import { rankingViewPath, type MatrixRankingView } from "@/lib/ranking-views";
import { isRankingType, parseRegionQuery } from "@/lib/wca";
import { MatrixExplorer } from "./MatrixExplorer";

type SearchParams = Record<string, string | string[] | undefined>;

function getSearchParam(searchParams: SearchParams, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function getCanonicalParams(searchParams: SearchParams) {
  const params = new URLSearchParams();
  const rawType = getSearchParam(searchParams, "result");
  const type = isRankingType(rawType) ? rawType : "single";
  const { regionId } = parseRegionQuery(getSearchParam(searchParams, "region"));
  const search = getSearchParam(searchParams, "search").trim().slice(0, 80);
  if (type !== "single") params.set("result", type);
  if (regionId) params.set("region", regionId);
  if (search) params.set("search", search);
  return params;
}

export async function MatrixPage({
  view,
  searchParams,
}: {
  view: MatrixRankingView;
  searchParams: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const params = getCanonicalParams(resolvedSearchParams);
  const currentParams = new URLSearchParams();
  Object.entries(resolvedSearchParams).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((item) => currentParams.append(key, item));
    else if (value !== undefined) currentParams.set(key, value);
  });
  if (params.toString() !== currentParams.toString()) {
    const query = params.toString();
    redirect(query ? `${rankingViewPath(view)}?${query}` : rankingViewPath(view));
  }

  const rawType = params.get("result");
  const rankingType = isRankingType(rawType) ? rawType : "single";
  const { scope, regionId } = parseRegionQuery(params.get("region"));
  const search = params.get("search") ?? "";
  const [initialData, continents, countries] = await Promise.all([
    loadRankingMatrix({ view, type: rankingType, scope, regionId, search }),
    getRegions("continent"),
    getRegions("country"),
  ]);

  return (
    <MatrixExplorer
      initialData={initialData}
      initialView={view}
      initialRankingType={rankingType}
      initialRegionSelection={{ scope, regionId }}
      initialSearch={search}
      initialRegions={{ continents, countries }}
    />
  );
}
