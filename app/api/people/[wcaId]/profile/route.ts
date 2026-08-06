import { loadPersonProfileHeader } from "@/lib/person-profile";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ wcaId: string }> },
) {
  try {
    const { wcaId } = await context.params;
    const profile = await loadPersonProfileHeader(wcaId);
    if (!profile) {
      return Response.json(
        { error: "Person profile was not found." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json(profile, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=3600" },
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        operation: "person_profile_header",
        status: 503,
        error: error instanceof Error ? error.message : "unknown",
        error_name: error instanceof Error ? error.name : "unknown",
      }),
    );
    return Response.json(
      { error: "Person profile is unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
