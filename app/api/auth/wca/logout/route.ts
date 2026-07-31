import {
  clearAuthSessionCookie,
  deleteAuthSession,
} from "@/services/auth/auth";
import { getSameOriginDestination } from "@/services/auth/wca";

export function getLogoutDestination(request: Request) {
  return getSameOriginDestination(request, request.headers.get("referer"));
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
