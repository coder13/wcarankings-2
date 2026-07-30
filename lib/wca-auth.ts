export type WcaProfile = {
  wcaId: string;
  name: string;
  countryIso2: string;
  avatarUrl: string | null;
};

type WcaMeResponse = {
  me?: {
    wca_id?: string;
    name?: string;
    country_iso2?: string;
    avatar?: { thumb_url?: string; url?: string };
  };
};

const LOCAL_WCA_ORIGIN = "https://staging.worldcubeassociation.org";
const LOCAL_WCA_CLIENT_ID = "example-application-id";
const LOCAL_WCA_CLIENT_SECRET = "example-secret";
const PRODUCTION_WCA_ORIGIN = "https://www.worldcubeassociation.org";

function isLocalDevelopment(request: Request) {
  const hostname = new URL(request.url).hostname;
  return process.env.NODE_ENV !== "production" && (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]"
  );
}

export function getWcaAuthConfig(request: Request) {
  const runtime = process.env;
  const localDevelopment = isLocalDevelopment(request);
  const configuredOrigin = runtime.WCA_ORIGIN?.replace(/\/+$/, "");
  const clientId = runtime.WCA_CLIENT_ID ?? (localDevelopment ? LOCAL_WCA_CLIENT_ID : undefined);
  const clientSecret = runtime.WCA_CLIENT_SECRET ?? (localDevelopment ? LOCAL_WCA_CLIENT_SECRET : undefined);
  const redirectUri = runtime.WCA_REDIRECT_URI ?? `${getRequestOrigin(request)}/api/auth/wca/callback`;
  const wcaOrigin = configuredOrigin ?? (localDevelopment ? LOCAL_WCA_ORIGIN : PRODUCTION_WCA_ORIGIN);
  const exampleConfiguration = clientId === LOCAL_WCA_CLIENT_ID || clientSecret === LOCAL_WCA_CLIENT_SECRET || wcaOrigin === LOCAL_WCA_ORIGIN;
  if (runtime.NODE_ENV === "production" && exampleConfiguration) {
    return { clientId: undefined, clientSecret: undefined, redirectUri, wcaOrigin: PRODUCTION_WCA_ORIGIN };
  }
  return { clientId, clientSecret, redirectUri, wcaOrigin };
}

export function getRequestOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedProtocol === "https" || forwardedProtocol === "http") {
    return `${forwardedProtocol}://${requestUrl.host}`;
  }
  return requestUrl.origin;
}

export function getSameOriginDestination(request: Request, candidate: string | null) {
  const origin = getRequestOrigin(request);
  if (!candidate) return origin;
  try {
    const destination = new URL(candidate);
    return destination.origin === origin ? destination.toString() : origin;
  } catch {
    return origin;
  }
}

export function readCookie(request: Request, name: string) {
  const cookies = request.headers.get("cookie") ?? "";
  for (const cookie of cookies.split(";")) {
    const [rawKey, ...rawValue] = cookie.trim().split("=");
    if (rawKey === name) return decodeURIComponent(rawValue.join("="));
  }
  return null;
}

export function makeCookie(
  name: string,
  value: string,
  request: Request,
  options: { maxAge?: number; sameSite?: "Lax" | "Strict" } = {},
) {
  const secure = getRequestOrigin(request).startsWith("https:") ? "; Secure" : "";
  const maxAge = options.maxAge === undefined ? "" : `; Max-Age=${options.maxAge}`;
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=${options.sameSite ?? "Lax"}${maxAge}${secure}`;
}

export function toWcaProfile(response: WcaMeResponse): WcaProfile | null {
  const me = response.me;
  if (!me?.wca_id || !me.name) return null;
  return {
    wcaId: me.wca_id,
    name: me.name,
    countryIso2: me.country_iso2 ?? "",
    avatarUrl: me.avatar?.thumb_url ?? me.avatar?.url ?? null,
  };
}
