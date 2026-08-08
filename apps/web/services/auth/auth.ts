import type { ResultSetHeader } from "mysql2/promise";
import { query, withTransaction } from "@/db";
import { makeCookie, readCookie } from "@/services/auth/wca";
import {
  generateSessionToken,
  hashSessionToken,
} from "@/services/auth/helpers";
import {
  authUserByIdQuery,
  authUserBySessionQuery,
  deleteAuthSessionQuery,
  insertAuthSessionQuery,
  upsertUserQuery,
} from "@/services/auth/queries";
import type { AuthUser, AuthUserRow, WcaProfile } from "@/services/auth/types";

export { generateSessionToken } from "@/services/auth/helpers";

const AUTH_SESSION_COOKIE = "wca_session";
export const AUTH_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function toAuthUser(row: AuthUserRow): AuthUser {
  return {
    id: Number(row.id),
    wcaId: row.wca_id,
    name: row.name,
    countryIso2: row.country_iso2,
    avatarUrl: row.avatar_url,
    allowListInclusion: Boolean(row.allow_list_inclusion),
  };
}

export async function createAuthSession(profile: WcaProfile) {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + AUTH_SESSION_MAX_AGE_SECONDS * 1000);

  const user = await withTransaction(async (connection) => {
    const [result] = await connection.execute<ResultSetHeader>(
      upsertUserQuery(),
      [profile.wcaId, profile.name, profile.countryIso2, profile.avatarUrl],
    );
    const userId = Number(result.insertId);
    await connection.execute(insertAuthSessionQuery(), [
      tokenHash,
      userId,
      expiresAt,
    ]);
    const [rows] = await connection.execute<AuthUserRow[]>(
      authUserByIdQuery(),
      [userId],
    );
    if (!rows[0]) throw new Error("The WCA user could not be persisted.");
    return toAuthUser(rows[0]);
  });

  return { token, user, expiresAt };
}

export async function getAuthUser(request: Request) {
  const token = readCookie(request, AUTH_SESSION_COOKIE);
  if (!token) return null;
  const result = await query<AuthUserRow>(authUserBySessionQuery(), [
    hashSessionToken(token),
  ]);
  return result.rows[0] ? toAuthUser(result.rows[0]) : null;
}

export async function deleteAuthSession(request: Request) {
  const token = readCookie(request, AUTH_SESSION_COOKIE);
  if (!token) return;
  await withTransaction(async (connection) => {
    await connection.execute(deleteAuthSessionQuery(), [
      hashSessionToken(token),
    ]);
  });
}

export function authSessionCookie(token: string, request: Request) {
  return makeCookie(AUTH_SESSION_COOKIE, token, request, {
    maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
    sameSite: "Lax",
  });
}

export function clearAuthSessionCookie(request: Request) {
  return makeCookie(AUTH_SESSION_COOKIE, "", request, {
    maxAge: 0,
    sameSite: "Lax",
  });
}

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("Sign in with the WCA to continue.");
    this.name = "AuthenticationRequiredError";
  }
}

export async function requireAuthUser(request: Request) {
  const user = await getAuthUser(request);
  if (!user) throw new AuthenticationRequiredError();
  return user;
}
