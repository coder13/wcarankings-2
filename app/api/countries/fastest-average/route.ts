import { handleProjectionRequest } from "@/controllers/projection-controller";
import { withFixedQueryParams } from "@/lib/api/fixed-query-params";
import { loadCountryRankings } from "@/services/rankings/country-rankings";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleProjectionRequest(request, "country-rankings", (params) =>
    loadCountryRankings(
      withFixedQueryParams(params, { result: "average" }),
    ),
  );
}
