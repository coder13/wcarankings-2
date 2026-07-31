import { createHash, randomBytes } from "node:crypto";

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest();
}

export function generateSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function isLocalDevelopment(request: Request) {
  const hostname = new URL(request.url).hostname;
  return (
    process.env.NODE_ENV !== "production" &&
    (hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]")
  );
}
