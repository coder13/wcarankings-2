import { handleProjectionRequest } from "@/controllers/projection-controller";
import { loadPersonCompetitionRankings } from "@/services/rankings/person-competitions";
import { collectPersonCompetitionPopularity } from "@/services/ranking-popularity/person-activity";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleProjectionRequest(
    request,
    "person-competition-rankings",
    loadPersonCompetitionRankings,
    (params) => {
      void collectPersonCompetitionPopularity(params);
    },
  );
}
