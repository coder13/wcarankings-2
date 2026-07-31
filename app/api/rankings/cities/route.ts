import { handleProjectionApi } from "@/lib/projection-api";
import { loadCityRankings } from "@/lib/semantic-entity-rankings";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleProjectionApi(request, "city-rankings", loadCityRankings);
}
