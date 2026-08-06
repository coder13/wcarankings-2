import { handleProjectionRequest } from "@/controllers/projection-controller";
import { loadCountryRankings } from "@/services/rankings/country-rankings";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleProjectionRequest(
    request,
    "country-rankings",
    loadCountryRankings,
  );
}
