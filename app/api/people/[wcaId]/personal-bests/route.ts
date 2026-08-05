import { handleProjectionRequest } from "@/controllers/projection-controller";
import { loadPersonalBestsPreview } from "@/services/people/personal-bests-preview";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ wcaId: string }> },
) {
  const { wcaId } = await context.params;
  return handleProjectionRequest(request, "person-personal-bests-preview", () =>
    loadPersonalBestsPreview(wcaId),
  );
}
