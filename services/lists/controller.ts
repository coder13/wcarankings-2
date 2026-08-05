import {
  buildApiErrorResponse,
  buildApiJsonResponse,
  readJsonObject,
  assertSameOrigin,
} from "@/lib/api";
import { getAuthUser, requireAuthUser } from "@/services/auth/auth";
import {
  addListMembers,
  assertCanViewList,
  cloneList,
  createList,
  decideMembershipRequest,
  deleteList,
  listContainingUser,
  listMemberIds,
  listMembers,
  listMembershipRequests,
  listOwnedLists,
  listPublicLists,
  ListValidationError,
  removeListMember,
  removeSelfFromList,
  requestListMembership,
  resolveList,
  updateList,
} from "@/services/lists/lists";
import { loadListRankings } from "@/services/lists/rankings";
import type {
  ListMemberRouteContext,
  ListRouteContext,
  MembershipDecisionRouteContext,
} from "@/services/lists/types";

export type {
  ListMemberRouteContext,
  ListRouteContext,
  MembershipDecisionRouteContext,
} from "@/services/lists/types";

function privateResponse(body: unknown, status?: number) {
  return buildApiJsonResponse(body, {
    ...(status === undefined ? {} : { status }),
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function getPublicLists() {
  const lists = await listPublicLists();
  return buildApiJsonResponse(
    { lists },
    { headers: { "Cache-Control": "public, max-age=30, s-maxage=300" } },
  );
}

export async function getUserLists(request: Request) {
  const user = await requireAuthUser(request);
  const relation = new URL(request.url).searchParams.get("relation");
  const lists =
    relation === "containing"
      ? await listContainingUser(user)
      : await listOwnedLists(user);
  return privateResponse({ lists });
}

export async function createUserList(request: Request) {
  assertSameOrigin(request);
  const user = await requireAuthUser(request);
  const body = await readJsonObject(request);
  const created = await createList(user, {
    name: body.name,
    description: body.description,
    visibility: body.visibility,
    joinPolicy: body.joinPolicy,
    personIds: body.personIds,
  });
  return buildApiJsonResponse(created, {
    status: 201,
    headers: {
      "Cache-Control": "private, no-store",
      Location: `/lists/${created.list.publicId}--${created.list.slug}`,
    },
  });
}

export async function getList(request: Request, context: ListRouteContext) {
  const { listId } = await context.params;
  const [list, user] = await Promise.all([
    resolveList(listId),
    getAuthUser(request),
  ]);
  assertCanViewList(list, user);
  if (new URL(request.url).searchParams.get("format") === "csv") {
    const personIds = await listMemberIds(list);
    const filename = `${list.publicId ?? list.systemAlias ?? "list"}.csv`;
    return new Response(
      `${personIds.join("\n")}${personIds.length ? "\n" : ""}`,
      {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "private, no-store",
        },
      },
    );
  }
  return buildApiJsonResponse(
    { list },
    {
      headers: {
        "Cache-Control":
          list.visibility === "public"
            ? "public, max-age=60, s-maxage=300"
            : "private, no-store",
      },
    },
  );
}

export async function cloneUserList(
  request: Request,
  context: ListRouteContext,
) {
  assertSameOrigin(request);
  const user = await requireAuthUser(request);
  const { listId } = await context.params;
  const source = await resolveList(listId);
  assertCanViewList(source, user);
  const list = await cloneList(user, source);
  return privateResponse({ list }, 201);
}

export async function updateUserList(
  request: Request,
  context: ListRouteContext,
) {
  assertSameOrigin(request);
  const user = await requireAuthUser(request);
  const body = await readJsonObject(request);
  const { listId } = await context.params;
  const list = await updateList(user, listId, {
    name: body.name,
    description: body.description,
    visibility: body.visibility,
    joinPolicy: body.joinPolicy,
  });
  return privateResponse({ list });
}

export async function deleteUserList(
  request: Request,
  context: ListRouteContext,
) {
  assertSameOrigin(request);
  const user = await requireAuthUser(request);
  const { listId } = await context.params;
  await deleteList(user, listId);
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function getListMembers(
  request: Request,
  context: ListRouteContext,
) {
  const { listId } = await context.params;
  const [list, user] = await Promise.all([
    resolveList(listId),
    getAuthUser(request),
  ]);
  assertCanViewList(list, user);
  const params = new URL(request.url).searchParams;
  const page = await listMembers(list, {
    after: params.get("after") ?? "",
    limit: Number(params.get("limit")) || 50,
  });
  return buildApiJsonResponse(
    { list, ...page },
    {
      headers: {
        "Cache-Control":
          list.visibility === "public"
            ? "public, max-age=30, s-maxage=120"
            : "private, no-store",
      },
    },
  );
}

export async function addMembersToList(
  request: Request,
  context: ListRouteContext,
) {
  assertSameOrigin(request);
  const user = await requireAuthUser(request);
  const body = await readJsonObject(request);
  const { listId } = await context.params;
  const result = await addListMembers(
    user,
    listId,
    Array.isArray(body.personIds) ? body.personIds : [],
    body.source === "bulk_import" ? "bulk_import" : "owner",
  );
  return privateResponse(result);
}

export async function removeListMemberById(
  request: Request,
  context: ListMemberRouteContext,
) {
  assertSameOrigin(request);
  const user = await requireAuthUser(request);
  const { listId, personId } = await context.params;
  const removed = await removeListMember(user, listId, personId);
  return privateResponse({ removed });
}

export async function removeCurrentUserFromList(
  request: Request,
  context: ListRouteContext,
) {
  assertSameOrigin(request);
  const user = await requireAuthUser(request);
  const { listId } = await context.params;
  await removeSelfFromList(user, listId);
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function getListRankings(
  request: Request,
  context: ListRouteContext,
) {
  const startedAt = performance.now();
  const { listId } = await context.params;
  const [list, user] = await Promise.all([
    resolveList(listId),
    getAuthUser(request),
  ]);
  assertCanViewList(list, user);
  const result = await loadListRankings(
    list,
    new URL(request.url).searchParams,
  );
  const totalMs = performance.now() - startedAt;
  console.info(
    JSON.stringify({
      operation: "list-rankings",
      list_id: list.id,
      list_kind: list.kind,
      member_count: list.memberCount,
      returned_rows: result.entries.length,
      total_ms: totalMs,
    }),
  );
  return buildApiJsonResponse(result, {
    headers: {
      "Cache-Control":
        list.visibility === "public"
          ? "public, max-age=30, s-maxage=300, stale-while-revalidate=60"
          : "private, no-store",
      "Server-Timing": `total;dur=${totalMs.toFixed(1)}`,
      "X-List-Membership-Version": String(list.membershipVersion),
      "X-Rankings-Data-Version": result.exportDate ?? "unknown",
    },
  });
}

export async function getMembershipRequests(
  request: Request,
  context: ListRouteContext,
) {
  const user = await requireAuthUser(request);
  const { listId } = await context.params;
  const requests = await listMembershipRequests(user, listId);
  return privateResponse({ requests });
}

export async function createMembershipRequest(
  request: Request,
  context: ListRouteContext,
) {
  assertSameOrigin(request);
  const user = await requireAuthUser(request);
  const { listId } = await context.params;
  const result = await requestListMembership(user, listId);
  return privateResponse(result, 201);
}

export async function decideMembershipRequestForUser(
  request: Request,
  context: MembershipDecisionRouteContext,
) {
  assertSameOrigin(request);
  const user = await requireAuthUser(request);
  const body = await readJsonObject(request);
  if (body.decision !== "accepted" && body.decision !== "rejected") {
    throw new ListValidationError("Decision must be accepted or rejected.");
  }
  const { listId, requestId: rawRequestId } = await context.params;
  const requestId = Number(rawRequestId);
  if (!Number.isSafeInteger(requestId) || requestId <= 0) {
    throw new ListValidationError("Invalid membership request ID.");
  }
  const result = await decideMembershipRequest(
    user,
    listId,
    requestId,
    body.decision,
  );
  return privateResponse({ status: body.decision, ...result });
}

export async function withListErrors(
  operation: () => Promise<Response>,
): Promise<Response> {
  try {
    return await operation();
  } catch (error) {
    return buildApiErrorResponse(error);
  }
}
