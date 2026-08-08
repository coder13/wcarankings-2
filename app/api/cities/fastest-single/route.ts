import { handleProjectionRequest } from "@/controllers/projection-controller";
import { withFixedQueryParams } from "@/lib/api/fixed-query-params";
import { collectCityRankingPopularity } from "@/services/ranking-popularity/city-rankings";
import { loadCityRankings } from "@/services/rankings/city-rankings";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleProjectionRequest(
    request,
    "city-fastest-single-rankings",
    (params) =>
      loadCityRankings(withFixedQueryParams(params, { result: "single" })),
    (params) =>
      void collectCityRankingPopularity(
        withFixedQueryParams(params, { result: "single" }),
      ),
  );
}
