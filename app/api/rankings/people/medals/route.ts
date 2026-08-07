import { handleProjectionRequest } from "@/controllers/projection-controller";
import { loadPersonMedalRankings } from "@/services/rankings/medals";
import { collectPersonMedalsPopularity } from "@/services/ranking-popularity/person-medals";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleProjectionRequest(
    request,
    "person-medal-rankings",
    loadPersonMedalRankings,
    (params) => {
      void collectPersonMedalsPopularity(params);
    },
  );
}
