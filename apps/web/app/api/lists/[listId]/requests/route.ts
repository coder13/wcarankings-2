import {
  createMembershipRequest,
  getMembershipRequests,
  type ListRouteContext,
  withListErrors,
} from "@/services/lists/controller";

export const dynamic = "force-dynamic";

export function GET(request: Request, context: ListRouteContext) {
  return withListErrors(() => getMembershipRequests(request, context));
}

export function POST(request: Request, context: ListRouteContext) {
  return withListErrors(() => createMembershipRequest(request, context));
}
