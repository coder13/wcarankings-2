import { handleProjectionApi } from "@/lib/projection-api";
import { loadPersonSearch, loadPersonSearchParts } from "@/lib/person-search";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (request.headers.get("accept")?.includes("text/event-stream")) {
    try {
      const parts = await loadPersonSearchParts(new URL(request.url).searchParams);
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          send("results", parts.payload);
          send("thumbs", await parts.thumbs);
          controller.close();
        },
      });
      return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
    } catch (error) {
      return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Search failed." }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
  }
  return handleProjectionApi(request, "person-search", loadPersonSearch);
}
