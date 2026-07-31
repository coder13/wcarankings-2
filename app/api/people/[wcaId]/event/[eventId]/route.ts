import { DatabaseOverloadedError } from "@/db";
import { loadPersonEventDetails } from "@/lib/person-event-details";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ wcaId: string; eventId: string }> },
) {
  try {
    const { wcaId, eventId } = await context.params;
    const details = await loadPersonEventDetails(wcaId, eventId);
    if (!details) {
      return Response.json(
        { error: "Person event details were not found." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json(details, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=3600" },
    });
  } catch (error) {
    console.error(JSON.stringify({
      operation: "person_event_details",
      status: 503,
      error: error instanceof Error ? error.message : "unknown",
      error_name: error instanceof Error ? error.name : "unknown",
    }));
    return Response.json(
      { error: "Person event details are unavailable." },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          ...(error instanceof DatabaseOverloadedError ? { "Retry-After": "1" } : {}),
        },
      },
    );
  }
}
