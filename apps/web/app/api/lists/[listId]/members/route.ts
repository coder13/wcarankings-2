import {
  addMembersToList,
  getListMembers,
  type ListRouteContext,
  withListErrors,
} from "@/services/lists/controller";

export const dynamic = "force-dynamic";

export function GET(request: Request, context: ListRouteContext) {
  return withListErrors(() => getListMembers(request, context));
}

export function POST(request: Request, context: ListRouteContext) {
  return withListErrors(() => addMembersToList(request, context));
}
