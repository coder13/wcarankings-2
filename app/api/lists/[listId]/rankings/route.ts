import {
  getListRankings,
  type ListRouteContext,
  withListErrors,
} from "@/controllers/list-controller";

export const dynamic = "force-dynamic";

export function GET(request: Request, context: ListRouteContext) {
  return withListErrors(() => getListRankings(request, context));
}
