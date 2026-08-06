import { handleHomeFeedRequest } from "@/controllers/feed-controller";
import { loadFeedStatPreviews } from "@/services/feeds/stat-previews";
import { getAuthUser } from "@/services/auth/auth";
import { getRegions } from "@/services/regions/service";
import { loadFeedUserPreferences } from "@/services/feeds/preferences";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (new URL(request.url).searchParams.has("cursor")) {
    const cursor = Number(new URL(request.url).searchParams.get("cursor"));
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
  return handleHomeFeedRequest(request);
}
