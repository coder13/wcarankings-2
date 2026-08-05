import { handleProjectionRequest } from "@/controllers/projection-controller";
import { loadPersonProfileStatPreviews } from "@/services/profile-stat-previews";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ wcaId: string }> },
) {
  const { wcaId } = await context.params;
  return handleProjectionRequest(request, "person-profile-stat-previews", () =>
    loadPersonProfileStatPreviews(wcaId),
  );
}
