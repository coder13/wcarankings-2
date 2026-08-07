import { handleProjectionRequest } from "@/controllers/projection-controller";
import { withFixedQueryParams } from "@/lib/api/fixed-query-params";
import { collectCompetitionRankingPopularity } from "@/services/ranking-popularity/competition-rankings";
import { loadCompetitionRankings } from "@/services/rankings/competition-rankings";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleProjectionRequest(
    request,
    "competition-fastest-rankings",
    (params) =>
      loadCompetitionRankings(
        withFixedQueryParams(params, { ranking: "fastest" }),
      ),
    (params) =>
      void collectCompetitionRankingPopularity(
        withFixedQueryParams(params, { ranking: "fastest" }),
      ),
  );
}
