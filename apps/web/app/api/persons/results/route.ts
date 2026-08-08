import { handleProjectionRequest } from "@/controllers/projection-controller";
import { buildApiErrorResponse } from "@/lib/api";
import { getAuthUser } from "@/services/auth/auth";
import {
  DynamicListInputError,
  parseDynamicListIds,
  resolveDynamicList,
} from "@/services/lists/dynamic-list";
import { assertCanViewList, resolveList } from "@/services/lists/lists";
import {
  loadDynamicListResultRankings,
  loadSavedListResultRankings,
} from "@/services/lists/result-rankings";
import { collectResultRankingPopularity } from "@/services/ranking-popularity/result-rankings";
import { loadResultRankings } from "@/services/rankings/result";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (params.has("list") || params.has("wca_ids")) {
    if (params.has("list") && params.has("wca_ids")) {
      return Response.json(
        { error: "Choose either a saved list or dynamic WCA IDs." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    try {
      if (params.has("list")) {
        const [list, user] = await Promise.all([
          resolveList(params.get("list") ?? ""),
          getAuthUser(request),
        ]);
        assertCanViewList(list, user);
        return handleProjectionRequest(
          request,
          "list-result-rankings",
          (listParams) => loadSavedListResultRankings(list, listParams),
        );
      }
      const ids = parseDynamicListIds(params.getAll("wca_ids"));
      const dynamicList = await resolveDynamicList(ids.personIds);
      return handleProjectionRequest(
        request,
        "list-result-rankings",
        (listParams) =>
          loadDynamicListResultRankings(dynamicList.personIds, listParams),
      );
    } catch (error) {
      if (error instanceof DynamicListInputError) {
        return Response.json(
          { error: error.message },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
      }
      return buildApiErrorResponse(error);
    }
  }
  return handleProjectionRequest(
    request,
    "result-rankings",
    loadResultRankings,
    (resultParams) => void collectResultRankingPopularity(resultParams),
  );
}
