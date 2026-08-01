import { getAdminHealthSnapshot } from "@/lib/admin-health";

export const dynamic = "force-dynamic";

export async function GET() {
  const payload = await getAdminHealthSnapshot();
  return Response.json(payload, {
    status: payload.database.available ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
