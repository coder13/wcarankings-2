import {
  decideMembershipRequestForUser,
  type MembershipDecisionRouteContext,
  withListErrors,
} from "@/controllers/list-controller";

export function POST(request: Request, context: MembershipDecisionRouteContext) {
  return withListErrors(() => decideMembershipRequestForUser(request, context));
}
