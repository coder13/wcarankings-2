import { handleProjectionRequest } from "@/controllers/projection-controller";
import { loadPersonMedalPreview } from "@/services/people/medal-preview";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ wcaId: string }> },
) {
  const { wcaId } = await context.params;
  return handleProjectionRequest(request, "person-medal-preview", (params) =>
    loadPersonMedalPreview(wcaId, params),
  );
}
