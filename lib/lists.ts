import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { query, withTransaction } from "@/db";
import type { AuthUser } from "@/lib/auth";
import {
  generateListPublicId,
  normalizeListLookup,
  normalizeListPublicId,
  slugifyListName,
} from "@/lib/list-identifiers";

export type ListVisibility = "public" | "private";
export type ListJoinPolicy = "open" | "closed";
export type ListKind = "user" | "system";

export type ListSummary = {
  id: number;
  publicId: string | null;
  systemAlias: string | null;
  kind: ListKind;
  name: string;
  slug: string;
  description: string | null;
  visibility: ListVisibility;
  joinPolicy: ListJoinPolicy;
  memberCount: number;
  membershipVersion: number;
  systemDefinitionVersion: number | null;
  owner: {
    id: number;
    name: string;
    wcaId: string;
  } | null;
  createdAt: string;
  updatedAt: string;
};

type ListRow = {
  id: number;
  public_id: string | null;
  system_alias: string | null;
  kind: ListKind;
  owner_user_id: number | null;
  owner_name: string | null;
  owner_wca_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  visibility: ListVisibility;
  join_policy: ListJoinPolicy;
  member_count: number;
  membership_version: number;
  system_definition_version: number | null;
  created_at: string;
  updated_at: string;
};

type MemberRow = {
  person_id: string;
  person_name: string | null;
  country_id: string | null;
  source: "owner" | "self_request" | "bulk_import" | "system_rule";
  created_at: string;
};

type RequestRow = {
  id: number;
  list_id: number;
  requester_user_id: number;
  person_id: string;
  requester_name: string;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  created_at: string;
  resolved_at: string | null;
};

export class ListValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ListValidationError";
  }
}

export class ListNotFoundError extends Error {
  constructor() {
    super("List not found.");
    this.name = "ListNotFoundError";
  }
}

export class ListForbiddenError extends Error {
  constructor(message = "You do not have access to this list.") {
    super(message);
    this.name = "ListForbiddenError";
  }
}

export class ListConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ListConflictError";
  }
}

function isDuplicateKey(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ER_DUP_ENTRY",
  );
}

function toListSummary(row: ListRow): ListSummary {
  return {
    id: Number(row.id),
    publicId: row.public_id,
    systemAlias: row.system_alias,
    kind: row.kind,
    name: row.name,
    slug: row.slug,
    description: row.description,
    visibility: row.visibility,
    joinPolicy: row.join_policy,
    memberCount: Number(row.member_count),
    membershipVersion: Number(row.membership_version),
    systemDefinitionVersion:
      row.system_definition_version === null
        ? null
        : Number(row.system_definition_version),
    owner:
      row.owner_user_id && row.owner_name && row.owner_wca_id
        ? {
            id: Number(row.owner_user_id),
            name: row.owner_name,
            wcaId: row.owner_wca_id,
          }
        : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

const LIST_COLUMNS = `
  l.id,
  l.public_id,
  l.system_alias,
  l.kind,
  l.owner_user_id,
  owner.name AS owner_name,
  owner.wca_id AS owner_wca_id,
  l.name,
  l.slug,
  l.description,
  l.visibility,
  l.join_policy,
  l.member_count,
  l.membership_version,
  l.system_definition_version,
  l.created_at,
  l.updated_at
`;

function validateName(value: unknown) {
  if (typeof value !== "string") {
    throw new ListValidationError("List name is required.");
  }
  const name = value.trim();
  if (!name || name.length > 100) {
    throw new ListValidationError("List name must be between 1 and 100 characters.");
  }
  return name;
}

function validateDescription(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.trim().length > 500) {
    throw new ListValidationError("List description must be 500 characters or fewer.");
  }
  return value.trim();
}

function validateVisibility(value: unknown): ListVisibility {
  if (value !== "public" && value !== "private") {
    throw new ListValidationError("Choose public or private visibility.");
  }
  return value;
}

function validateJoinPolicy(value: unknown): ListJoinPolicy {
  if (value !== "open" && value !== "closed") {
    throw new ListValidationError("Choose open or closed membership.");
  }
  return value;
}

function normalizeWcaId(value: unknown) {
  if (typeof value !== "string") return null;
  const wcaId = value.trim().toUpperCase();
  return /^\d{4}[A-Z0-9]{4}\d{2}$/.test(wcaId) ? wcaId : null;
}

async function selectListForUpdate(
  connection: Parameters<Parameters<typeof withTransaction>[0]>[0],
  lookup: string,
) {
  const normalized = normalizeListLookup(lookup);
  if (!normalized) throw new ListNotFoundError();
  const publicId = normalizeListPublicId(normalized);
  const [rows] = await connection.execute<(ListRow & RowDataPacket)[]>(
    `SELECT ${LIST_COLUMNS}
     FROM lists AS l
     LEFT JOIN app_users AS owner ON owner.id = l.owner_user_id
     WHERE ${publicId ? "l.public_id = ?" : "l.system_alias = ?"}
       AND l.deleted_at IS NULL
     LIMIT 1
     FOR UPDATE`,
    [normalized],
  );
  if (!rows[0]) throw new ListNotFoundError();
  return rows[0];
}

export async function resolveList(lookup: string) {
  const normalized = normalizeListLookup(lookup);
  if (!normalized) throw new ListNotFoundError();
  const publicId = normalizeListPublicId(normalized);
  const result = await query<ListRow>(
    `SELECT ${LIST_COLUMNS}
     FROM lists AS l
     LEFT JOIN app_users AS owner ON owner.id = l.owner_user_id
     WHERE ${publicId ? "l.public_id = ?" : "l.system_alias = ?"}
       AND l.deleted_at IS NULL
     LIMIT 1`,
    [normalized],
  );
  if (!result.rows[0]) throw new ListNotFoundError();
  return toListSummary(result.rows[0]);
}

export function assertCanViewList(_list: ListSummary, _user: AuthUser | null) {
  // Visibility only controls whether a user-created list is shown in the
  // public directory. Every list can be opened through its direct URL.
  void _list;
  void _user;
}

function assertOwner(row: ListRow, user: AuthUser) {
  if (row.kind !== "user") {
    throw new ListForbiddenError("System lists are read-only.");
  }
  if (Number(row.owner_user_id) !== user.id) {
    throw new ListForbiddenError();
  }
}

async function activity(
  connection: Parameters<Parameters<typeof withTransaction>[0]>[0],
  {
    listId,
    actorUserId,
    eventType,
    personId = null,
    eventData = null,
  }: {
    listId: number | null;
    actorUserId: number | null;
    eventType: string;
    personId?: string | null;
    eventData?: Record<string, unknown> | null;
  },
) {
  await connection.execute(
    `INSERT INTO list_activity_events
      (list_id, actor_user_id, event_type, person_id, event_data)
     VALUES (?, ?, ?, ?, ?)`,
    [
      listId,
      actorUserId,
      eventType,
      personId,
      eventData ? JSON.stringify(eventData) : null,
    ],
  );
}

export async function createList(
  user: AuthUser,
  input: {
    name: unknown;
    description?: unknown;
    visibility?: unknown;
    joinPolicy?: unknown;
    personIds?: unknown;
  },
) {
  const name = validateName(input.name);
  const description = validateDescription(input.description);
  const visibility =
    input.visibility === undefined ? "private" : validateVisibility(input.visibility);
  const joinPolicy =
    input.joinPolicy === undefined ? "closed" : validateJoinPolicy(input.joinPolicy);
  const slug = slugifyListName(name);
  const rawPersonIds = Array.isArray(input.personIds) ? input.personIds : [];
  const normalizedPersonIds = [...new Set(rawPersonIds.map(normalizeWcaId).filter(Boolean))] as string[];
  const invalid = rawPersonIds
    .filter((personId) => !normalizeWcaId(personId))
    .map((personId) => String(personId).slice(0, 40));

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const publicId = generateListPublicId();
    try {
      const membership = await withTransaction(async (connection) => {
        const [result] = await connection.execute<ResultSetHeader>(
          `INSERT INTO lists
            (kind, public_id, owner_user_id, name, slug, description, visibility, join_policy)
           VALUES ('user', ?, ?, ?, ?, ?, ?, ?)`,
          [publicId, user.id, name, slug, description, visibility, joinPolicy],
        );
        const listId = Number(result.insertId);
        const valid = new Set<string>();
        const blocked = new Set<string>();
        if (normalizedPersonIds.length) {
          const placeholders = normalizedPersonIds.map(() => "?").join(",");
          const [people] = await connection.execute<(RowDataPacket & { wca_id: string })[]>(
            `SELECT wca_id FROM persons WHERE sub_id = 1 AND wca_id IN (${placeholders})`,
            normalizedPersonIds,
          );
          people.forEach((person) => valid.add(person.wca_id));
          const validIds = normalizedPersonIds.filter((personId) => valid.has(personId));
          if (validIds.length) {
            const validPlaceholders = validIds.map(() => "?").join(",");
            const [optedOut] = await connection.execute<(RowDataPacket & { wca_id: string })[]>(
              `SELECT wca_id FROM app_users WHERE allow_list_inclusion = FALSE AND wca_id IN (${validPlaceholders})`,
              validIds,
            );
            optedOut.forEach((person) => blocked.add(person.wca_id));
            const added = validIds.filter((personId) => !blocked.has(personId));
            if (added.length) {
              await connection.execute(
                `INSERT INTO list_members (list_id, person_id, added_by_user_id, source)
                 VALUES ${added.map(() => "(?, ?, ?, 'bulk_import')").join(",")}`,
                added.flatMap((personId) => [listId, personId, user.id]),
              );
              await connection.execute(
                "UPDATE lists SET member_count = ?, membership_version = membership_version + 1 WHERE id = ?",
                [added.length, listId],
              );
            }
          }
        }
        await activity(connection, {
          listId,
          actorUserId: user.id,
          eventType: "list.created",
          eventData: { visibility, joinPolicy, memberCount: normalizedPersonIds.length },
        });
        return {
          invalid: [...invalid, ...normalizedPersonIds.filter((personId) => !valid.has(personId))],
          blocked: [...blocked],
        };
      });
      return { list: await resolveList(publicId), ...membership };
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
  }
  throw new Error("Could not allocate a unique list ID.");
}

export async function cloneList(user: AuthUser, source: ListSummary) {
  const name = validateName(`${source.name.slice(0, 95)} copy`);
  const slug = slugifyListName(name);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const publicId = generateListPublicId();
    try {
      await withTransaction(async (connection) => {
        const [created] = await connection.execute<ResultSetHeader>(
          `INSERT INTO lists
            (kind, public_id, owner_user_id, name, slug, description, visibility, join_policy)
           VALUES ('user', ?, ?, ?, ?, ?, 'private', 'closed')`,
          [publicId, user.id, name, slug, source.description],
        );
        const listId = Number(created.insertId);
        const [members] = await connection.execute<ResultSetHeader>(
          `INSERT INTO list_members (list_id, person_id, added_by_user_id, source)
           SELECT ?, person_id, ?, 'bulk_import'
           FROM list_members
           WHERE list_id = ?`,
          [listId, user.id, source.id],
        );
        await connection.execute(
          "UPDATE lists SET member_count = ?, membership_version = membership_version + 1 WHERE id = ?",
          [members.affectedRows, listId],
        );
        await activity(connection, {
          listId,
          actorUserId: user.id,
          eventType: "list.cloned",
          eventData: { sourceListId: source.publicId ?? source.systemAlias, memberCount: members.affectedRows },
        });
      });
      return resolveList(publicId);
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
  }
  throw new Error("Could not allocate a unique list ID.");
}

export async function listMemberIds(list: ListSummary) {
  const result = await query<RowDataPacket & { person_id: string }>(
    "SELECT person_id FROM list_members WHERE list_id = ? ORDER BY person_id",
    [list.id],
  );
  return result.rows.map((row) => row.person_id);
}

export async function updateList(
  user: AuthUser,
  lookup: string,
  input: {
    name?: unknown;
    description?: unknown;
    visibility?: unknown;
    joinPolicy?: unknown;
  },
) {
  await withTransaction(async (connection) => {
    const row = await selectListForUpdate(connection, lookup);
    assertOwner(row, user);
    const name = input.name === undefined ? row.name : validateName(input.name);
    const description =
      input.description === undefined
        ? row.description
        : validateDescription(input.description);
    const visibility =
      input.visibility === undefined
        ? row.visibility
        : validateVisibility(input.visibility);
    const joinPolicy =
      input.joinPolicy === undefined
        ? row.join_policy
        : validateJoinPolicy(input.joinPolicy);
    await connection.execute(
      `UPDATE lists
       SET name = ?, slug = ?, description = ?, visibility = ?, join_policy = ?
       WHERE id = ?`,
      [name, slugifyListName(name), description, visibility, joinPolicy, row.id],
    );
    await activity(connection, {
      listId: Number(row.id),
      actorUserId: user.id,
      eventType: "list.updated",
      eventData: { visibility, joinPolicy },
    });
  });
  return resolveList(lookup);
}

export async function deleteList(user: AuthUser, lookup: string) {
  await withTransaction(async (connection) => {
    const row = await selectListForUpdate(connection, lookup);
    assertOwner(row, user);
    await activity(connection, {
      listId: Number(row.id),
      actorUserId: user.id,
      eventType: "list.deleted",
    });
    await connection.execute(
      "UPDATE lists SET deleted_at = CURRENT_TIMESTAMP(6) WHERE id = ?",
      [row.id],
    );
  });
}

export async function listOwnedLists(user: AuthUser) {
  const result = await query<ListRow>(
    `SELECT ${LIST_COLUMNS}
     FROM lists AS l
     LEFT JOIN app_users AS owner ON owner.id = l.owner_user_id
     WHERE l.owner_user_id = ?
       AND l.deleted_at IS NULL
     ORDER BY l.updated_at DESC, l.id DESC`,
    [user.id],
  );
  return result.rows.map(toListSummary);
}

export type PublicListSummary = Pick<
  ListSummary,
  "publicId" | "systemAlias" | "slug" | "name" | "memberCount" | "kind"
> & {
  createdBy: string | null;
};

export async function listPublicLists() {
  const result = await query<ListRow>(
    `SELECT ${LIST_COLUMNS}
     FROM lists AS l
     LEFT JOIN app_users AS owner ON owner.id = l.owner_user_id
     WHERE l.visibility = 'public'
       AND l.deleted_at IS NULL
     ORDER BY l.kind = 'system' DESC, l.name ASC, l.id ASC`,
  );
  return result.rows.map((row): PublicListSummary => {
    const list = toListSummary(row);
    return {
      publicId: list.publicId,
      systemAlias: list.systemAlias,
      slug: list.slug,
      name: list.name,
      memberCount: list.memberCount,
      kind: list.kind,
      createdBy: list.kind === "system" ? null : list.owner?.name ?? "WCA member",
    };
  });
}

export async function listContainingUser(user: AuthUser) {
  const result = await query<ListRow>(
    `SELECT ${LIST_COLUMNS}
     FROM list_members AS member
     JOIN lists AS l ON l.id = member.list_id
     LEFT JOIN app_users AS owner ON owner.id = l.owner_user_id
     WHERE member.person_id = ?
       AND l.deleted_at IS NULL
     ORDER BY l.updated_at DESC, l.id DESC`,
    [user.wcaId],
  );
  return result.rows.map(toListSummary);
}

export type ListMembershipState = "member" | "pending" | "not_member";

export async function getListMembershipState(
  list: ListSummary,
  user: AuthUser | null,
): Promise<ListMembershipState | null> {
  if (!user) return null;
  const membership = await query<RowDataPacket>(
    `SELECT 1
     FROM list_members
     WHERE list_id = ? AND person_id = ?
     LIMIT 1`,
    [list.id, user.wcaId],
  );
  if (membership.rows.length > 0) return "member";

  // System lists do not accept membership requests, but their membership is
  // still useful for list-scoped UI such as the "My rank" action.
  if (list.kind !== "user") return "not_member";

  const request = await query<RowDataPacket>(
    `SELECT 1
     FROM list_membership_requests
     WHERE list_id = ? AND person_id = ? AND status = 'pending'
     LIMIT 1`,
    [list.id, user.wcaId],
  );
  return request.rows.length > 0 ? "pending" : "not_member";
}

export async function listMembers(
  list: ListSummary,
  {
    after = "",
    limit = 50,
  }: {
    after?: string;
    limit?: number;
  } = {},
) {
  const pageSize = Math.max(1, Math.min(100, Math.floor(limit)));
  const result = await query<MemberRow>(
    `SELECT
      member.person_id,
      person.name AS person_name,
      person.country_id,
      member.source,
      member.created_at
     FROM list_members AS member
     LEFT JOIN persons AS person
       ON person.wca_id = member.person_id
      AND person.sub_id = 1
     WHERE member.list_id = ?
       AND member.person_id > ?
     ORDER BY member.person_id
     LIMIT ?`,
    [list.id, after.trim().toUpperCase(), pageSize + 1],
  );
  const rows = result.rows.slice(0, pageSize);
  return {
    members: rows.map((row) => ({
      personId: row.person_id,
      name: row.person_name,
      countryId: row.country_id,
      source: row.source,
      addedAt: String(row.created_at),
    })),
    nextCursor:
      result.rows.length > pageSize ? rows.at(-1)?.person_id ?? null : null,
  };
}

export async function addListMembers(
  user: AuthUser,
  lookup: string,
  rawPersonIds: unknown[],
  source: "owner" | "bulk_import" = "owner",
) {
  if (!Array.isArray(rawPersonIds) || rawPersonIds.length === 0) {
    throw new ListValidationError("Provide at least one WCA ID.");
  }
  if (rawPersonIds.length > 1000) {
    throw new ListValidationError("A single request can add at most 1,000 people.");
  }
  const normalized = [...new Set(rawPersonIds.map(normalizeWcaId).filter(Boolean))] as string[];
  const invalid = rawPersonIds
    .filter((value) => !normalizeWcaId(value))
    .map((value) => String(value).slice(0, 40));

  return withTransaction(async (connection) => {
    const row = await selectListForUpdate(connection, lookup);
    assertOwner(row, user);
    if (normalized.length === 0) {
      return { added: [], duplicates: [], invalid, blocked: [] };
    }
    const placeholders = normalized.map(() => "?").join(",");
    const [personRows] = await connection.execute<
      (RowDataPacket & { wca_id: string })[]
    >(
      `SELECT wca_id
       FROM persons
       WHERE sub_id = 1
         AND wca_id IN (${placeholders})`,
      normalized,
    );
    const valid = new Set(personRows.map((person) => person.wca_id));
    for (const personId of normalized) {
      if (!valid.has(personId)) invalid.push(personId);
    }
    const candidates = normalized.filter((personId) => valid.has(personId));
    if (candidates.length === 0) {
      return { added: [], duplicates: [], invalid, blocked: [] };
    }
    const candidatePlaceholders = candidates.map(() => "?").join(",");
    const [blockedRows] = await connection.execute<
      (RowDataPacket & { wca_id: string })[]
    >(
      `SELECT user.wca_id
       FROM app_users AS user
       WHERE user.wca_id IN (${candidatePlaceholders})
         AND user.allow_list_inclusion = FALSE
       FOR UPDATE`,
      candidates,
    );
    const [excludedRows] = await connection.execute<
      (RowDataPacket & { person_id: string })[]
    >(
      `SELECT person_id
       FROM list_exclusions
       WHERE list_id = ?
         AND person_id IN (${candidatePlaceholders})
       FOR UPDATE`,
      [row.id, ...candidates],
    );
    const [existingRows] = await connection.execute<
      (RowDataPacket & { person_id: string })[]
    >(
      `SELECT person_id
       FROM list_members
       WHERE list_id = ?
         AND person_id IN (${candidatePlaceholders})
       FOR UPDATE`,
      [row.id, ...candidates],
    );
    const blockedSet = new Set([
      ...blockedRows.map((blocked) => blocked.wca_id),
      ...excludedRows.map((excluded) => excluded.person_id),
    ]);
    const existing = new Set(existingRows.map((member) => member.person_id));
    const added = candidates.filter(
      (personId) => !blockedSet.has(personId) && !existing.has(personId),
    );
    if (added.length > 0) {
      const values = added.map(() => "(?, ?, ?, ?)").join(",");
      await connection.execute(
        `INSERT INTO list_members
          (list_id, person_id, added_by_user_id, source)
         VALUES ${values}`,
        added.flatMap((personId) => [row.id, personId, user.id, source]),
      );
      await connection.execute(
        `UPDATE lists
         SET member_count = member_count + ?,
             membership_version = membership_version + 1
         WHERE id = ?`,
        [added.length, row.id],
      );
      await activity(connection, {
        listId: Number(row.id),
        actorUserId: user.id,
        eventType: "members.added",
        eventData: { count: added.length, source },
      });
    }
    return {
      added,
      duplicates: candidates.filter((personId) => existing.has(personId)),
      invalid,
      blocked: candidates.filter((personId) => blockedSet.has(personId)),
    };
  });
}

export async function removeListMember(
  user: AuthUser,
  lookup: string,
  rawPersonId: string,
) {
  const personId = normalizeWcaId(rawPersonId);
  if (!personId) throw new ListValidationError("Invalid WCA ID.");
  return withTransaction(async (connection) => {
    const row = await selectListForUpdate(connection, lookup);
    assertOwner(row, user);
    const [result] = await connection.execute<ResultSetHeader>(
      "DELETE FROM list_members WHERE list_id = ? AND person_id = ?",
      [row.id, personId],
    );
    if (result.affectedRows > 0) {
      await connection.execute(
        `UPDATE lists
         SET member_count = GREATEST(0, member_count - 1),
             membership_version = membership_version + 1
         WHERE id = ?`,
        [row.id],
      );
      await activity(connection, {
        listId: Number(row.id),
        actorUserId: user.id,
        eventType: "member.removed_by_owner",
        personId,
      });
    }
    return result.affectedRows > 0;
  });
}

export async function removeSelfFromList(user: AuthUser, lookup: string) {
  return withTransaction(async (connection) => {
    const row = await selectListForUpdate(connection, lookup);
    const [result] = await connection.execute<ResultSetHeader>(
      "DELETE FROM list_members WHERE list_id = ? AND person_id = ?",
      [row.id, user.wcaId],
    );
    if (result.affectedRows === 0) {
      throw new ListConflictError("You are not currently included in this list.");
    }
    await connection.execute(
      `INSERT INTO list_exclusions (list_id, person_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE created_at = CURRENT_TIMESTAMP(6)`,
      [row.id, user.wcaId],
    );
    await connection.execute(
      `UPDATE lists
       SET member_count = GREATEST(0, member_count - 1),
           membership_version = membership_version + 1
       WHERE id = ?`,
      [row.id],
    );
    await activity(connection, {
      listId: Number(row.id),
      actorUserId: user.id,
      eventType: "member.self_removed",
      personId: user.wcaId,
    });
  });
}

export async function requestListMembership(user: AuthUser, lookup: string) {
  if (!user.allowListInclusion) {
    throw new ListConflictError("Enable list inclusion before requesting membership.");
  }
  return withTransaction(async (connection) => {
    const row = await selectListForUpdate(connection, lookup);
    if (row.kind !== "user" || row.visibility !== "public") {
      throw new ListNotFoundError();
    }
    const [memberRows] = await connection.execute<RowDataPacket[]>(
      "SELECT 1 FROM list_members WHERE list_id = ? AND person_id = ? LIMIT 1",
      [row.id, user.wcaId],
    );
    if (memberRows.length > 0) {
      throw new ListConflictError("You are already included in this list.");
    }
    if (row.join_policy === "open") {
      await connection.execute(
        "DELETE FROM list_exclusions WHERE list_id = ? AND person_id = ?",
        [row.id, user.wcaId],
      );
      const [insert] = await connection.execute<ResultSetHeader>(
        `INSERT IGNORE INTO list_members
          (list_id, person_id, added_by_user_id, source)
         VALUES (?, ?, ?, 'self_request')`,
        [row.id, user.wcaId, user.id],
      );
      if (insert.affectedRows > 0) {
        await connection.execute(
          `UPDATE lists
           SET member_count = member_count + 1,
               membership_version = membership_version + 1
           WHERE id = ?`,
          [row.id],
        );
      }
      await activity(connection, {
        listId: Number(row.id),
        actorUserId: user.id,
        eventType: "membership.joined",
        personId: user.wcaId,
      });
      return { status: "joined" as const };
    }
    await connection.execute(
      `INSERT INTO list_membership_requests
        (list_id, requester_user_id, person_id, status, created_at, resolved_at, resolved_by_user_id)
       VALUES (?, ?, ?, 'pending', CURRENT_TIMESTAMP(6), NULL, NULL)
       ON DUPLICATE KEY UPDATE
        requester_user_id = VALUES(requester_user_id),
        status = 'pending',
        created_at = CURRENT_TIMESTAMP(6),
        resolved_at = NULL,
        resolved_by_user_id = NULL`,
      [row.id, user.id, user.wcaId],
    );
    await activity(connection, {
      listId: Number(row.id),
      actorUserId: user.id,
      eventType: "membership.requested",
      personId: user.wcaId,
    });
    return { status: "pending" as const };
  });
}

export async function listMembershipRequests(user: AuthUser, lookup: string) {
  const list = await resolveList(lookup);
  if (list.kind !== "user" || list.owner?.id !== user.id) {
    throw new ListForbiddenError();
  }
  const result = await query<RequestRow>(
    `SELECT
      request.id,
      request.list_id,
      request.requester_user_id,
      request.person_id,
      requester.name AS requester_name,
      request.status,
      request.created_at,
      request.resolved_at
     FROM list_membership_requests AS request
     JOIN app_users AS requester ON requester.id = request.requester_user_id
     WHERE request.list_id = ?
       AND request.status = 'pending'
     ORDER BY
      request.created_at`,
    [list.id],
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    personId: row.person_id,
    name: row.requester_name,
    status: row.status,
    createdAt: String(row.created_at),
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
  }));
}

export async function decideMembershipRequest(
  user: AuthUser,
  lookup: string,
  requestId: number,
  decision: "accepted" | "rejected",
) {
  return withTransaction(async (connection) => {
    const list = await selectListForUpdate(connection, lookup);
    assertOwner(list, user);
    const [requests] = await connection.execute<
      (RequestRow & RowDataPacket)[]
    >(
      `SELECT
        request.id,
        request.list_id,
        request.requester_user_id,
        request.person_id,
        requester.name AS requester_name,
        request.status,
        request.created_at,
        request.resolved_at
       FROM list_membership_requests AS request
       JOIN app_users AS requester ON requester.id = request.requester_user_id
       WHERE request.id = ?
         AND request.list_id = ?
       LIMIT 1
       FOR UPDATE`,
      [requestId, list.id],
    );
    const request = requests[0];
    if (!request || request.status !== "pending") {
      throw new ListConflictError("This membership request is no longer pending.");
    }

    let added = false;
    if (decision === "accepted") {
      const [preferenceRows] = await connection.execute<
        (RowDataPacket & { allow_list_inclusion: number })[]
      >(
        `SELECT allow_list_inclusion
         FROM app_users
         WHERE id = ?
         FOR UPDATE`,
        [request.requester_user_id],
      );
      if (!preferenceRows[0]?.allow_list_inclusion) {
        throw new ListConflictError("This person cannot be added.");
      }
      await connection.execute(
        "DELETE FROM list_exclusions WHERE list_id = ? AND person_id = ?",
        [list.id, request.person_id],
      );
      const [insert] = await connection.execute<ResultSetHeader>(
        `INSERT IGNORE INTO list_members
          (list_id, person_id, added_by_user_id, source)
         VALUES (?, ?, ?, 'self_request')`,
        [list.id, request.person_id, user.id],
      );
      added = insert.affectedRows > 0;
      if (added) {
        await connection.execute(
          `UPDATE lists
           SET member_count = member_count + 1,
               membership_version = membership_version + 1
           WHERE id = ?`,
          [list.id],
        );
      }
    }
    await connection.execute(
      `UPDATE list_membership_requests
       SET status = ?,
           resolved_at = CURRENT_TIMESTAMP(6),
           resolved_by_user_id = ?
       WHERE id = ?`,
      [decision, user.id, request.id],
    );
    await activity(connection, {
      listId: Number(list.id),
      actorUserId: user.id,
      eventType: `membership.${decision}`,
      personId: request.person_id,
    });
    return { added };
  });
}

export async function setListInclusionPreference(
  user: AuthUser,
  allowListInclusion: boolean,
) {
  await withTransaction(async (connection) => {
    await connection.execute(
      `UPDATE app_users
       SET allow_list_inclusion = ?
       WHERE id = ?`,
      [allowListInclusion, user.id],
    );
    if (allowListInclusion) return;

    await connection.execute(
      `UPDATE lists AS list_record
       JOIN (
         SELECT list_id, COUNT(*) AS removed_count
         FROM list_members
         WHERE person_id = ?
         GROUP BY list_id
       ) AS removed ON removed.list_id = list_record.id
       SET
         list_record.member_count = GREATEST(0, list_record.member_count - removed.removed_count),
         list_record.membership_version = list_record.membership_version + 1`,
      [user.wcaId],
    );
    await connection.execute(
      "DELETE FROM list_members WHERE person_id = ?",
      [user.wcaId],
    );
    await connection.execute(
      `UPDATE list_membership_requests
       SET status = 'cancelled',
           resolved_at = CURRENT_TIMESTAMP(6),
           resolved_by_user_id = ?
       WHERE person_id = ?
         AND status = 'pending'`,
      [user.id, user.wcaId],
    );
    await activity(connection, {
      listId: null,
      actorUserId: user.id,
      eventType: "preference.list_inclusion_disabled",
      personId: user.wcaId,
    });
  });
}
