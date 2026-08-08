export function upsertUserQuery() {
  return sqlFragment`
    INSERT INTO
      app_users (
        wca_id,
        name,
        country_iso2,
        avatar_url,
        last_login_at
      )
    VALUES
      (?, ?, ?, ?, CURRENT_TIMESTAMP (6))
    ON DUPLICATE KEY UPDATE
      id = LAST_INSERT_ID(id),
      name = VALUES(name),
      country_iso2 = VALUES(country_iso2),
      avatar_url = VALUES(avatar_url),
      last_login_at = CURRENT_TIMESTAMP (6)
  `;
}

export function insertAuthSessionQuery() {
  return sqlFragment`
    INSERT INTO
      auth_sessions (token_hash, user_id, expires_at)
    VALUES
      (?, ?, ?)
  `;
}

export function authUserByIdQuery() {
  return sqlFragment`
    SELECT
      id,
      wca_id,
      name,
      country_iso2,
      avatar_url,
      allow_list_inclusion
    FROM
      app_users
    WHERE
      id = ?
  `;
}

export function authUserBySessionQuery() {
  return sqlFragment`
    SELECT
      u.id,
      u.wca_id,
      u.name,
      u.country_iso2,
      u.avatar_url,
      u.allow_list_inclusion
    FROM
      auth_sessions AS s
      JOIN app_users AS u ON u.id = s.user_id
    WHERE
      s.token_hash = ?
      AND s.expires_at > CURRENT_TIMESTAMP (6)
    LIMIT
      1
  `;
}

export function deleteAuthSessionQuery() {
  return sqlFragment`
    DELETE FROM auth_sessions
    WHERE
      token_hash = ?
  `;
}
import { sqlFragment } from "@/lib/helpers/database/sql";
