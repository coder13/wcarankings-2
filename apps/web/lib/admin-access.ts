import { getAuthUser } from "@/services/auth/auth";
import type { AuthUser } from "@/services/auth/types";

const adminUserIds = new Set([436, 8184]);

export function hasAdminAccess(user: Pick<AuthUser, "id"> | null) {
  return (
    process.env.NODE_ENV === "development" ||
    (user !== null && adminUserIds.has(user.id))
  );
}

export async function rejectNonAdmin(
  request: Request,
): Promise<Response | null> {
  if (hasAdminAccess(await getAuthUser(request))) return null;
  return Response.json({ error: "Admin access is required." }, { status: 403 });
}
