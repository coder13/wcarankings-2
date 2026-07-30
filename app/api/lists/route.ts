import {
  requireAuthUser,
} from "@/lib/auth";
import {
  apiError,
  assertSameOrigin,
  readJsonObject,
} from "@/lib/api";
import {
  createList,
  listContainingUser,
  listOwnedLists,
} from "@/lib/lists";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireAuthUser(request);
    const relation = new URL(request.url).searchParams.get("relation");
    const lists =
      relation === "containing"
        ? await listContainingUser(user)
        : await listOwnedLists(user);
    return Response.json(
      { lists },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
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
    return Response.json(
      created,
      {
        status: 201,
        headers: {
          "Cache-Control": "private, no-store",
          Location: `/lists/${created.list.publicId}--${created.list.slug}`,
        },
      },
    );
  } catch (error) {
    return apiError(error);
  }
}
