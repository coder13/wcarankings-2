import { getAdminRuntimeSnapshot } from "@/lib/admin-runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getAdminRuntimeSnapshot(), {
    headers: { "Cache-Control": "no-store" },
  });
}
