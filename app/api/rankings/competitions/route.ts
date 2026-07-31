import { handleProjectionRequest } from "@/controllers/projection-controller";
import { loadCompetitionRankings } from "@/services/rankings/entity";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleProjectionRequest(
    request,
    "competition-rankings",
    loadCompetitionRankings,
  );
}
