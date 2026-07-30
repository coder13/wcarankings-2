import { getAuthUser, requireAuthUser } from "@/lib/auth";
import {
  apiError,
  assertSameOrigin,
  readJsonObject,
} from "@/lib/api";
import {
  assertCanViewList,
  cloneList,
  deleteList,
  listMemberIds,
  resolveList,
  updateList,
} from "@/lib/lists";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ listId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { listId } = await context.params;
    const [list, user] = await Promise.all([
      resolveList(listId),
      getAuthUser(request),
    ]);
    assertCanViewList(list, user);
    if (new URL(request.url).searchParams.get("format") === "csv") {
      const personIds = await listMemberIds(list);
      const filename = `${list.publicId ?? list.systemAlias ?? "list"}.csv`;
      return new Response(`${personIds.join("\n")}${personIds.length ? "\n" : ""}`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "private, no-store",
        },
      });
    }
    return Response.json(
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
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthUser(request);
    const { listId } = await context.params;
    const source = await resolveList(listId);
    assertCanViewList(source, user);
    const list = await cloneList(user, source);
    return Response.json({ list }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
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
    return Response.json(
      { list },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthUser(request);
    const { listId } = await context.params;
    await deleteList(user, listId);
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
