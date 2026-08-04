import { buildApiJsonResponse } from "@/lib/api";
import {
  loadPersonSearch,
  loadPersonSearchParts,
} from "@/services/people/service";
import { handleProjectionRequest } from "@/controllers/projection-controller";

function buildSearchEventStream(
  parts: Awaited<ReturnType<typeof loadPersonSearchParts>>,
) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      send("results", parts.payload);
      send("thumbs", await parts.thumbs);
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function buildSearchStreamError(error: unknown) {
  return buildApiJsonResponse(
    { error: error instanceof Error ? error.message : "Search failed." },
    { status: 400 },
  );
}

export async function handlePersonSearchRequest(request: Request) {
  if (!request.headers.get("accept")?.includes("text/event-stream")) {
    return handleProjectionRequest(request, "person-search", loadPersonSearch);
  }
  try {
    const requestUrl = new URL(request.url);
    const parts = await loadPersonSearchParts(requestUrl.searchParams);
    return buildSearchEventStream(parts);
  } catch (error) {
    return buildSearchStreamError(error);
  }
}
