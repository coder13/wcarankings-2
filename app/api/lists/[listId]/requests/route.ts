import { requireAuthUser } from "@/lib/auth";
import {
  apiError,
  assertSameOrigin,
} from "@/lib/api";
import {
  listMembershipRequests,
  requestListMembership,
} from "@/lib/lists";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ listId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireAuthUser(request);
    const { listId } = await context.params;
    const requests = await listMembershipRequests(user, listId);
    return Response.json(
      { requests },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthUser(request);
    const { listId } = await context.params;
    const result = await requestListMembership(user, listId);
    return Response.json(
      result,
      {
        status: 201,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
