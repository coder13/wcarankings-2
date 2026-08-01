import { normalizeProfileWcaId } from "@/lib/person-profile";
import { fetchPersonThumbnailsFromWca } from "@/services/thumbnails/wca-person-thumbnails";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ wcaId: string }> },
) {
  const { wcaId } = await context.params;
  const normalized = normalizeProfileWcaId(wcaId);
  if (!normalized) {
    return Response.json({ error: "Person was not found." }, { status: 404 });
  }
  if (!request.headers.get("accept")?.includes("text/event-stream")) {
    const thumbs = await fetchPersonThumbnailsFromWca(normalized, [normalized], 1, 1).catch(() => new Map<string, string | null>());
    return Response.json({ personId: normalized, avatarUrl: thumbs.get(normalized) ?? null });
  }
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      const thumbs = await fetchPersonThumbnailsFromWca(normalized, [normalized], 1, 1).catch(() => new Map<string, string | null>());
      send("thumb", { personId: normalized, avatarUrl: thumbs.get(normalized) ?? null });
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
