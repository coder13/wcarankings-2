import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTH_SESSION_MAX_AGE_SECONDS,
  generateSessionToken,
} from "@/services/auth/auth";
import {
  getRequestOrigin,
  getSameOriginDestination,
  getWcaAuthConfig,
  makeCookie,
  toWcaProfile,
} from "@/services/auth/wca";
import { getLogoutDestination } from "@/app/api/auth/wca/logout/route";
import { GET as startWcaAuth } from "@/app/api/auth/wca/route";

test("creates high-entropy opaque session tokens", () => {
  const first = generateSessionToken();
  const second = generateSessionToken();
  assert.notEqual(first, second);
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(AUTH_SESSION_MAX_AGE_SECONDS, 60 * 60 * 24 * 30);
});

test("uses the configured WCA OAuth origin", () => {
  const previousOrigin = process.env.WCA_ORIGIN;
  process.env.WCA_ORIGIN = "https://staging.worldcubeassociation.org/";
  try {
    const config = getWcaAuthConfig(new Request("http://localhost:3002/"));
    assert.equal(config.wcaOrigin, "https://staging.worldcubeassociation.org");
  } finally {
    if (previousOrigin === undefined) delete process.env.WCA_ORIGIN;
    else process.env.WCA_ORIGIN = previousOrigin;
  }
});

test("uses the WCA staging example application only for local development", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousClientId = process.env.WCA_CLIENT_ID;
  const previousClientSecret = process.env.WCA_CLIENT_SECRET;
  const previousOrigin = process.env.WCA_ORIGIN;
  delete process.env.WCA_CLIENT_ID;
  delete process.env.WCA_CLIENT_SECRET;
  delete process.env.WCA_ORIGIN;
  process.env.NODE_ENV = "development";
  try {
    const config = getWcaAuthConfig(new Request("http://localhost:3000/api/auth/wca"));
    assert.deepEqual(config, {
      clientId: "example-application-id",
      clientSecret: "example-secret",
      redirectUri: "http://localhost:3000/api/auth/wca/callback",
      wcaOrigin: "https://staging.worldcubeassociation.org",
    });
    assert.deepEqual(
      getWcaAuthConfig(new Request("http://[::1]:3000/api/auth/wca")),
      {
        ...config,
        redirectUri: "http://[::1]:3000/api/auth/wca/callback",
      },
    );
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousClientId === undefined) delete process.env.WCA_CLIENT_ID;
    else process.env.WCA_CLIENT_ID = previousClientId;
    if (previousClientSecret === undefined) delete process.env.WCA_CLIENT_SECRET;
    else process.env.WCA_CLIENT_SECRET = previousClientSecret;
    if (previousOrigin === undefined) delete process.env.WCA_ORIGIN;
    else process.env.WCA_ORIGIN = previousOrigin;
  }
});

test("does not allow the WCA staging example configuration in production", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousClientId = process.env.WCA_CLIENT_ID;
  const previousClientSecret = process.env.WCA_CLIENT_SECRET;
  const previousOrigin = process.env.WCA_ORIGIN;
  process.env.NODE_ENV = "production";
  process.env.WCA_CLIENT_ID = "example-application-id";
  process.env.WCA_CLIENT_SECRET = "example-secret";
  process.env.WCA_ORIGIN = "https://staging.worldcubeassociation.org";
  try {
    const config = getWcaAuthConfig(new Request("https://rankings.example.com/api/auth/wca"));
    assert.equal(config.clientId, undefined);
    assert.equal(config.clientSecret, undefined);
    assert.equal(config.wcaOrigin, "https://www.worldcubeassociation.org");
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousClientId === undefined) delete process.env.WCA_CLIENT_ID;
    else process.env.WCA_CLIENT_ID = previousClientId;
    if (previousClientSecret === undefined) delete process.env.WCA_CLIENT_SECRET;
    else process.env.WCA_CLIENT_SECRET = previousClientSecret;
    if (previousOrigin === undefined) delete process.env.WCA_ORIGIN;
    else process.env.WCA_ORIGIN = previousOrigin;
  }
});

test("uses the forwarded HTTPS protocol for callback URLs and cookies", () => {
  const request = new Request("http://wcarankings.com/api/auth/wca", {
    headers: { "x-forwarded-proto": "https" },
  });
  assert.equal(getRequestOrigin(request), "https://wcarankings.com");
  assert.match(makeCookie("state", "value", request), /; Secure$/);
});

test("returns to the current same-origin page after sign-out", () => {
  const request = new Request("https://rankings.example.com/api/auth/wca/logout", {
    headers: { referer: "https://rankings.example.com/lists/7K3M9Q2D--friends?eventId=333" },
  });
  assert.equal(
    getLogoutDestination(request),
    "https://rankings.example.com/lists/7K3M9Q2D--friends?eventId=333",
  );
  const externalReferrer = new Request("https://rankings.example.com/api/auth/wca/logout", {
    headers: { referer: "https://example.com/not-a-safe-return-url" },
  });
  assert.equal(getLogoutDestination(externalReferrer), "https://rankings.example.com");
});

test("only uses a same-origin OAuth return destination", () => {
  const request = new Request("https://rankings.example.com/api/auth/wca/callback");
  assert.equal(
    getSameOriginDestination(request, "https://rankings.example.com/lists/7K3M9Q2D--friends?eventId=333"),
    "https://rankings.example.com/lists/7K3M9Q2D--friends?eventId=333",
  );
  assert.equal(
    getSameOriginDestination(request, "https://example.com/not-a-safe-return-url"),
    "https://rankings.example.com",
  );
});

test("stores the initiating page for the OAuth callback", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  try {
    const response = await startWcaAuth(new Request("http://localhost:3000/api/auth/wca", {
      headers: { referer: "http://localhost:3000/lists/7K3M9Q2D--friends?eventId=333" },
    }));
    assert.equal(response.status, 302);
    assert.ok(
      response.headers.getSetCookie().some((cookie) =>
        cookie.includes("wca_oauth_return_to=http%3A%2F%2Flocalhost%3A3000%2Flists%2F7K3M9Q2D--friends%3FeventId%3D333"),
      ),
    );
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test("prefers the WCA avatar thumbnail for the profile menu", () => {
  const profile = toWcaProfile({
    me: {
      wca_id: "2010TEST01",
      name: "Test Cuber",
      avatar: {
        thumb_url: "https://staging.worldcubeassociation.org/thumb.jpg",
        url: "https://staging.worldcubeassociation.org/full.jpg",
      },
    },
  });
  assert.equal(profile?.avatarUrl, "https://staging.worldcubeassociation.org/thumb.jpg");
});
