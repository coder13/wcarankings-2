import { getAuthUser } from "@/services/auth/auth";
import { hasAdminAccess } from "@/lib/admin-access";
import { getWcaAuthConfig } from "@/services/auth/wca";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { clientSecret } = getWcaAuthConfig(request);
  if (!clientSecret) {
    return Response.json(
      { profile: null, configured: false, admin: hasAdminAccess(null) },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const user = await getAuthUser(request);
  return Response.json(
    { profile: user, configured: true, admin: hasAdminAccess(user) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
