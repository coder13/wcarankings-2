import {
  loadFeedInterestingItems,
  loadFeedStatPreviews,
} from "@/services/feeds/stat-previews";
import { getAuthUser } from "@/services/auth/auth";
import { getRegions } from "@/services/regions/service";
import { loadFeedUserPreferences } from "@/services/feeds/preferences";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  let itemCursor: number | null = 0;
  if (url.searchParams.has("items")) {
    itemCursor = Number(url.searchParams.get("items"));
  } else if (url.searchParams.has("cursor")) {
    itemCursor = null;
  }
  if (itemCursor !== null) {
    const cursor = itemCursor;
    const [user, countries] = await Promise.all([
      getAuthUser(request),
      getRegions("country"),
    ]);
    const preferences = await loadFeedUserPreferences(user, countries);
    return loadFeedInterestingItems({ cursor, preferences })
      .then((data) => Response.json(data))
      .catch((error) => {
        console.error("Feed items are unavailable.", error);
        return Response.json(
          { error: "Feed items are unavailable." },
          { status: 503 },
        );
      });
  }
  if (url.searchParams.has("cursor")) {
    const cursor = Number(url.searchParams.get("cursor"));
    const rawLimit = url.searchParams.get("limit");
    const limit = rawLimit === null ? undefined : Number(rawLimit);
    if (
      limit !== undefined &&
      (!Number.isInteger(limit) || limit < 1 || limit > 5)
    ) {
      return Response.json(
        { error: "limit must be between 1 and 5." },
        { status: 400 },
      );
    }
    const [user, countries] = await Promise.all([
      getAuthUser(request),
      getRegions("country"),
    ]);
    const preferences = await loadFeedUserPreferences(user, countries);
    return loadFeedStatPreviews({ cursor, preferences, limit })
      .then((data) => Response.json(data))
      .catch(() =>
        Response.json(
          { error: "Feed previews are unavailable." },
          { status: 503 },
        ),
      );
  }
}
