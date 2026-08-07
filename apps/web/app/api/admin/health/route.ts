import { getAdminHealthSnapshot } from "@/lib/admin-health";
import { rejectNonAdmin } from "@/lib/admin-access";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const rejection = await rejectNonAdmin(request);
  if (rejection) return rejection;
  const payload = await getAdminHealthSnapshot();
  return Response.json(payload, {
    status: payload.database.available ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
