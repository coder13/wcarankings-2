import { query } from "@/db";
import { rejectNonAdmin } from "@/lib/admin-access";

export const dynamic = "force-dynamic";

type SettingsRow = { poll_seconds: number; next_import_at: string };

export async function GET(request: Request) {
  const rejection = await rejectNonAdmin(request);
  if (rejection) return rejection;
  const { rows } = await query<SettingsRow>(
    "SELECT poll_seconds, next_import_at FROM live_results_settings WHERE id = 1",
  );
  return Response.json({
    pollSeconds: Number(rows[0]?.poll_seconds ?? 3600),
    nextImportAt: rows[0]?.next_import_at ?? null,
  });
}

export async function PUT(request: Request) {
  const rejection = await rejectNonAdmin(request);
  if (rejection) return rejection;
  const body = (await request.json()) as {
    pollSeconds?: unknown;
    confirmed?: unknown;
  };
  const pollSeconds = Number(body.pollSeconds);
  if (
    !Number.isInteger(pollSeconds) ||
    pollSeconds < 60 ||
    pollSeconds > 86_400
  )
    return Response.json(
      {
        error:
          "Poll interval must be a whole number from 60 through 86400 seconds.",
      },
      { status: 400 },
    );
  if (body.confirmed !== true)
    return Response.json(
      { error: "Confirm the poll interval change before saving." },
      { status: 409 },
    );
  await query(
    `UPDATE live_results_settings
     SET poll_seconds = ?,
         next_import_at = DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL ? SECOND)
     WHERE id = 1`,
    [pollSeconds, pollSeconds],
  );
  return Response.json({ pollSeconds });
}
