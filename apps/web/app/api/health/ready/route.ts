import { assertRankingsReady } from "@/services/rankings/metadata";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await assertRankingsReady();
    return Response.json(
      { status: "ready" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const databaseError = error as {
      code?: string;
      errno?: number;
      sqlState?: string;
    };
    console.error(
      JSON.stringify({
        operation: "health_ready",
        status: 503,
        error: error instanceof Error ? error.message : String(error),
        error_name: error instanceof Error ? error.name : "unknown",
        stack: error instanceof Error ? error.stack : undefined,
        code: databaseError.code,
        errno: databaseError.errno,
        sql_state: databaseError.sqlState,
      }),
    );
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
