import { handleProjectionRequest } from "@/controllers/projection-controller";
import { loadCityRankings } from "@/services/rankings/entity";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleProjectionRequest(request, "city-rankings", loadCityRankings);
}
