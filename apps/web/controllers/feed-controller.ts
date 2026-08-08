import { buildApiJsonResponse } from "@/lib/api";
import { ApiInputError } from "@/lib/api/projection";
import { loadHomeFeed, type HomeFeedOptions } from "@/services/feeds/home-feed";

function parseLimit(request: Request) {
  const raw = new URL(request.url).searchParams.get("limit");
  if (raw === null) return undefined;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 5)
    throw new ApiInputError("limit must be between 1 and 5.");
  return limit;
}

export async function handleHomeFeedRequest(
  request: Request,
  options: HomeFeedOptions = {},
) {
  try {
    const data = await loadHomeFeed({ ...options, limit: parseLimit(request) });
    return buildApiJsonResponse(data, {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=300",
        "X-Feed-Generation": data.generationId,
        "X-Feed-Popularity-Date": data.popularityDate,
      },
    });
  } catch (error) {
    if (error instanceof ApiInputError)
      return buildApiJsonResponse({ error: error.message }, { status: 400 });
    console.error(error);
    return buildApiJsonResponse(
      { error: "The feed is unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
