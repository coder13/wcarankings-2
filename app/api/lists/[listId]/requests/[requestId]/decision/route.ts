import {
  decideMembershipRequestForUser,
  type MembershipDecisionRouteContext,
  withListErrors,
} from "@/services/lists/controller";

export function POST(request: Request, context: MembershipDecisionRouteContext) {
  return withListErrors(() => decideMembershipRequestForUser(request, context));
}
