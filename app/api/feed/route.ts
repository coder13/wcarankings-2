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
    const [user, countries] = await Promise.all([
      getAuthUser(request),
      getRegions("country"),
    ]);
    const preferences = await loadFeedUserPreferences(user, countries);
    return loadFeedStatPreviews({ cursor, preferences })
      .then((data) => Response.json(data))
      .catch(() =>
        Response.json(
          { error: "Feed previews are unavailable." },
          { status: 503 },
        ),
      );
  }
}
