import { handleProjectionRequest } from "@/controllers/projection-controller";
import { loadPersonCompetitionRankings } from "@/services/rankings/person-competitions";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleProjectionRequest(
    request,
    "person-competition-rankings",
    loadPersonCompetitionRankings,
  );
}
