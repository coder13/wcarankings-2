import {
  getRequestOrigin,
  getSameOriginDestination,
  getWcaAuthConfig,
  makeCookie,
} from "@/services/auth/wca";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { clientId, redirectUri, wcaOrigin } = getWcaAuthConfig(request);
  const origin = getRequestOrigin(request);
  if (!clientId) return Response.redirect(`${origin}/?auth=not-configured`, 302);

  const state = crypto.randomUUID();
  const returnTo = getSameOriginDestination(request, request.headers.get("referer"));
  const authorizeUrl = new URL("/oauth/authorize", wcaOrigin);
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "public");
  authorizeUrl.searchParams.set("state", state);

  const headers = new Headers({
    Location: authorizeUrl.toString(),
    "Cache-Control": "no-store",
  });
  headers.append(
    "Set-Cookie",
    makeCookie("wca_oauth_state", state, request, { maxAge: 600, sameSite: "Lax" }),
  );
  headers.append(
    "Set-Cookie",
    makeCookie("wca_oauth_return_to", returnTo, request, { maxAge: 600, sameSite: "Lax" }),
  );
  return new Response(null, { status: 302, headers });
}
