import {
  clearAuthSessionCookie,
  deleteAuthSession,
} from "@/lib/auth";
import { getRequestOrigin } from "@/lib/wca-auth";

export function getLogoutDestination(request: Request) {
  const origin = getRequestOrigin(request);
  const referrer = request.headers.get("referer");
  if (!referrer) return origin;
  try {
    const destination = new URL(referrer);
    return destination.origin === origin ? destination.toString() : origin;
  } catch {
    return origin;
  }
}

async function logout(request: Request) {
  await deleteAuthSession(request);
  return new Response(null, {
    status: 302,
    headers: {
      Location: getLogoutDestination(request),
      "Set-Cookie": clearAuthSessionCookie(request),
      "Cache-Control": "no-store",
    },
  });
}

export const GET = logout;
export const POST = logout;
