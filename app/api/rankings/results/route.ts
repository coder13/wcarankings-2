import { handleProjectionRequest } from "@/controllers/projection-controller";
import { loadResultRankings } from "@/lib/semantic-result-rankings";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleProjectionRequest(request, "result-rankings", loadResultRankings);
}
