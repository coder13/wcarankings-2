import {
  getWcaAuthConfig,
  getSameOriginDestination,
  getRequestOrigin,
  makeCookie,
  readCookie,
  toWcaProfile,
} from "@/services/auth/wca";
import type { WcaOAuthTokenResponse } from "@/lib/data/types";
import { authSessionCookie, createAuthSession } from "@/services/auth/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = getRequestOrigin(request);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const storedState = readCookie(request, "wca_oauth_state");
  const returnTo = getSameOriginDestination(
    request,
    readCookie(request, "wca_oauth_return_to"),
  );
  const { clientId, clientSecret, redirectUri, wcaOrigin } =
    getWcaAuthConfig(request);

  if (!code || !state || state !== storedState || !clientId || !clientSecret) {
    console.warn("WCA OAuth callback rejected before token exchange", {
      hasCode: Boolean(code),
      hasState: Boolean(state),
      stateMatches: state === storedState,
      configured: Boolean(clientId && clientSecret),
    });
    return Response.redirect(`${origin}/?auth=failed`, 302);
  }

  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    });
    const tokenResponse = await fetch(new URL("/oauth/token", wcaOrigin), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!tokenResponse.ok) {
      throw new Error(
        `WCA token exchange failed with status ${tokenResponse.status}`,
      );
    }
    const token = (await tokenResponse.json()) as WcaOAuthTokenResponse;
    if (!token.access_token) throw new Error("Token was missing");

    const meResponse = await fetch(new URL("/api/v0/me", wcaOrigin), {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!meResponse.ok) {
      throw new Error(
        `WCA profile request failed with status ${meResponse.status}`,
      );
    }
    const profile = toWcaProfile(await meResponse.json());
    if (!profile) throw new Error("Profile was missing a WCA ID");

    const session = await createAuthSession(profile);
    const headers = new Headers({
      Location: returnTo,
      "Cache-Control": "no-store",
    });
    headers.append("Set-Cookie", authSessionCookie(session.token, request));
    headers.append(
      "Set-Cookie",
      makeCookie("wca_oauth_state", "", request, { maxAge: 0 }),
    );
    headers.append(
      "Set-Cookie",
      makeCookie("wca_oauth_return_to", "", request, { maxAge: 0 }),
    );
    return new Response(null, { status: 302, headers });
  } catch (error) {
    console.error("WCA OAuth callback failed", error);
    return Response.redirect(`${origin}/?auth=failed`, 302);
  }
}
