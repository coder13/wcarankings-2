import { handleProjectionRequest } from "@/controllers/projection-controller";
import { parseEvent } from "@/lib/api/projection";
import { loadPersonEventResultRankings } from "@/services/rankings/person-results";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ wcaId: string }> },
) {
  const { wcaId } = await context.params;
  return handleProjectionRequest(
    request,
    "person-event-result-rankings",
    (params) =>
      loadPersonEventResultRankings(wcaId, parseEvent(params)!, params),
  );
}
