import { handleProjectionRequest } from "@/controllers/projection-controller";
import { loadPersonPrStreakRankings } from "@/services/rankings/person-pr-streak";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleProjectionRequest(
    request,
    "person-pr-streak-rankings",
    loadPersonPrStreakRankings,
  );
}
