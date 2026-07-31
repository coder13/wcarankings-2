import type { ResultSetHeader } from "mysql2/promise";
import { query, withTransaction } from "@/db";
import {
  makeCookie,
  readCookie,
} from "@/services/auth/wca";
import { generateSessionToken, hashSessionToken } from "@/services/auth/helpers";
import type { AuthUser, AuthUserRow, WcaProfile } from "@/services/auth/types";

export { generateSessionToken } from "@/services/auth/helpers";

export const AUTH_SESSION_COOKIE = "wca_session";
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
      `INSERT INTO app_users
        (wca_id, name, country_iso2, avatar_url, last_login_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(6))
       ON DUPLICATE KEY UPDATE
        id = LAST_INSERT_ID(id),
        name = VALUES(name),
        country_iso2 = VALUES(country_iso2),
        avatar_url = VALUES(avatar_url),
        last_login_at = CURRENT_TIMESTAMP(6)`,
      [profile.wcaId, profile.name, profile.countryIso2, profile.avatarUrl],
    );
    const userId = Number(result.insertId);
    await connection.execute(
      `INSERT INTO auth_sessions (token_hash, user_id, expires_at)
       VALUES (?, ?, ?)`,
      [tokenHash, userId, expiresAt],
    );
    const [rows] = await connection.execute<AuthUserRow[]>(
      `SELECT id, wca_id, name, country_iso2, avatar_url, allow_list_inclusion
       FROM app_users
       WHERE id = ?`,
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
  const result = await query<AuthUserRow>(
    `SELECT
      u.id,
      u.wca_id,
      u.name,
      u.country_iso2,
      u.avatar_url,
      u.allow_list_inclusion
     FROM auth_sessions AS s
     JOIN app_users AS u ON u.id = s.user_id
     WHERE s.token_hash = ?
       AND s.expires_at > CURRENT_TIMESTAMP(6)
     LIMIT 1`,
    [hashSessionToken(token)],
  );
  return result.rows[0] ? toAuthUser(result.rows[0]) : null;
}

export async function deleteAuthSession(request: Request) {
  const token = readCookie(request, AUTH_SESSION_COOKIE);
  if (!token) return;
  await withTransaction(async (connection) => {
    await connection.execute(
      "DELETE FROM auth_sessions WHERE token_hash = ?",
      [hashSessionToken(token)],
    );
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
