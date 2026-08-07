import { query } from "@/db";

export const dynamic = "force-dynamic";

type SettingsRow = { poll_seconds: number };

export async function GET() {
  const { rows } = await query<SettingsRow>(
    "SELECT poll_seconds FROM live_results_settings WHERE id = 1",
  );
  return Response.json({ pollSeconds: Number(rows[0]?.poll_seconds ?? 3600) });
}

export async function PUT(request: Request) {
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
    "UPDATE live_results_settings SET poll_seconds = ? WHERE id = 1",
    [pollSeconds],
  );
  return Response.json({ pollSeconds });
}
