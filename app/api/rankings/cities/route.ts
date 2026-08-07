import { handleProjectionRequest } from "@/controllers/projection-controller";
import { loadCityRankings } from "@/services/rankings/city-rankings";
import { collectCityRankingPopularity } from "@/services/ranking-popularity/city-rankings";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleProjectionRequest(
    request,
    "city-rankings",
    loadCityRankings,
    (params) => {
      void collectCityRankingPopularity(params);
    },
  );
}
