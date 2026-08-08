import { handleProjectionRequest } from "@/controllers/projection-controller";
import { withFixedQueryParams } from "@/lib/api/fixed-query-params";
import { loadPersonActivityRankings } from "@/services/rankings/person-activity";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleProjectionRequest(request, "person-solve-rankings", (params) =>
    loadPersonActivityRankings(
      withFixedQueryParams(params, { metric: "solves" }),
    ),
  );
}
