import { handleProjectionRequest } from "@/controllers/projection-controller";
import { loadTopRankingHighlights } from "@/services/people/top-ranking-highlights";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ wcaId: string }> },
) {
  const { wcaId } = await context.params;
  return handleProjectionRequest(
    request,
    "person-top-ranking-highlights",
    (params) => loadTopRankingHighlights(wcaId, params),
  );
}
