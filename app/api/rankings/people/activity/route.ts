import { handleProjectionRequest } from "@/controllers/projection-controller";
import { loadPersonActivityRankings } from "@/services/rankings/person-activity";
import { collectPersonActivityPopularity } from "@/services/ranking-popularity/person-activity";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleProjectionRequest(
    request,
    "person-activity-rankings",
    loadPersonActivityRankings,
    (params) => {
      void collectPersonActivityPopularity(params);
    },
  );
}
