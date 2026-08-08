import {
  getListRankings,
  type ListRouteContext,
  withListErrors,
} from "@/services/lists/controller";

export const dynamic = "force-dynamic";

export function GET(request: Request, context: ListRouteContext) {
  return withListErrors(() => getListRankings(request, context));
}
