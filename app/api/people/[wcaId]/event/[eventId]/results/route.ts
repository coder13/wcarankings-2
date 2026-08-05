import { handleProjectionRequest } from "@/controllers/projection-controller";
import { loadPersonEventResultRankings } from "@/services/rankings/person-results";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ wcaId: string; eventId: string }> },
) {
  const { wcaId, eventId } = await context.params;
  return handleProjectionRequest(
    request,
    "person-event-result-rankings",
    (params) => loadPersonEventResultRankings(wcaId, eventId, params),
  );
}
