import { handleHomeFeedRequest } from "@/controllers/feed-controller";
import { loadFeedStatPreviews } from "@/services/feeds/stat-previews";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  if (new URL(request.url).searchParams.has("cursor")) {
    const cursor = Number(new URL(request.url).searchParams.get("cursor"));
    return loadFeedStatPreviews({ cursor })
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
