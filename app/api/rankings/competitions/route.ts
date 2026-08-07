import { handleProjectionRequest } from "@/controllers/projection-controller";
import { loadCompetitionRankings } from "@/services/rankings/competition-rankings";
import { collectCompetitionRankingPopularity } from "@/services/ranking-popularity/competition-rankings";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleProjectionRequest(
    request,
    "competition-rankings",
    loadCompetitionRankings,
    (params) => {
      void collectCompetitionRankingPopularity(params);
    },
  );
}
