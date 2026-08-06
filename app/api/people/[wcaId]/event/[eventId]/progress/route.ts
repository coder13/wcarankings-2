import { handleProjectionRequest } from "@/controllers/projection-controller";
import { loadPersonEventResultProgress } from "@/services/rankings/person-result-progress";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ wcaId: string; eventId: string }> },
) {
  const { wcaId, eventId } = await context.params;
  return handleProjectionRequest(
    request,
    "person-event-result-progress",
    (params) => loadPersonEventResultProgress(wcaId, eventId, params),
  );
}
