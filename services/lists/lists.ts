import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { query, withTransaction } from "@/db";
import {
  assertListMemberCapacity,
  enqueueListRankingRebuild,
  USER_LIST_MEMBER_LIMIT,
} from "@/lib/list-ranking-cache";
import type { AuthUser } from "@/services/auth/types";
import {
  generateListPublicId,
  normalizeListLookup,
  normalizeListPublicId,
  slugifyListName,
} from "@/lib/helpers/lists/list-identifiers";
import type {
  ListJoinPolicy,
  ListRow,
  ListSummary,
  ListVisibility,
  MemberRow,
  PublicListSummary,
  RequestRow,
  ListMembershipState,
} from "@/services/lists/types";
import {
  blockedPersonIdsQuery,
  cancelUserMembershipRequestsQuery,
  containingUserListsQuery,
  createListQuery,
  decrementListMemberCountQuery,
  deleteListExclusionQuery,
  deleteListMemberQuery,
  deleteListQuery,
  excludedPersonIdsQuery,
  existingListMemberIdsQuery,
  incrementListMemberCountQuery,
  insertBulkListMembersQuery,
  insertListExclusionQuery,
  insertListMembersQuery,
  insertMembershipRequestQuery,
  insertSelfRequestMemberQuery,
  listLookupQuery,
  listMemberIdsQuery,
  listMembershipQuery,
  listMembersQuery,
  listInclusionPreferenceQuery,
  membershipRequestForUpdateQuery,
  membershipRequestsQuery,
  optedOutPersonIdsQuery,
  ownedListsQuery,
  pendingMembershipRequestQuery,
  personIdsForListQuery,
  publicListsQuery,
  removeUserFromListsQuery,
  removeUserListMembersQuery,
  updateListInclusionPreferenceQuery,
  updateListMemberCountQuery,
  updateListQuery,
  updateMembershipRequestQuery,
  validPersonIdsQuery,
  cloneListMembersQuery,
  cloneListQuery,
  listActivityQuery,
  LIST_COLUMNS,
} from "@/services/lists/queries";

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

function validateName(value: unknown) {
  if (typeof value !== "string") {
    throw new ListValidationError("List name is required.");
  }
  const name = value.trim();
  if (!name || name.length > 100) {
    throw new ListValidationError(
      "List name must be between 1 and 100 characters.",
    );
  }
  return name;
}

function validateDescription(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.trim().length > 500) {
    throw new ListValidationError(
      "List description must be 500 characters or fewer.",
    );
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

function ensureListMemberCapacity(
  kind: "user" | "system",
  currentCount: number,
  additions: number,
) {
  try {
    assertListMemberCapacity(kind, currentCount, additions);
  } catch (error) {
    throw new ListValidationError(
      error instanceof Error ? error.message : "List member limit reached.",
    );
  }
}

async function selectListForUpdate(
  connection: Parameters<Parameters<typeof withTransaction>[0]>[0],
  lookup: string,
) {
  const normalized = normalizeListLookup(lookup);
  if (!normalized) throw new ListNotFoundError();
  const publicId = normalizeListPublicId(normalized);
  const [rows] = await connection.execute<(ListRow & RowDataPacket)[]>(
    listLookupQuery({
      listColumns: LIST_COLUMNS,
      byPublicId: Boolean(publicId),
      forUpdate: true,
    }),
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
    listLookupQuery({
      listColumns: LIST_COLUMNS,
      byPublicId: Boolean(publicId),
    }),
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
  await connection.execute(listActivityQuery(), [
    listId,
    actorUserId,
    eventType,
    personId,
    eventData ? JSON.stringify(eventData) : null,
  ]);
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
    input.visibility === undefined
      ? "private"
      : validateVisibility(input.visibility);
  const joinPolicy =
    input.joinPolicy === undefined
      ? "closed"
      : validateJoinPolicy(input.joinPolicy);
  const slug = slugifyListName(name);
  const rawPersonIds = Array.isArray(input.personIds) ? input.personIds : [];
  const normalizedPersonIds = [
    ...new Set(rawPersonIds.map(normalizeWcaId).filter(Boolean)),
  ] as string[];
  if (normalizedPersonIds.length > USER_LIST_MEMBER_LIMIT) {
    throw new ListValidationError(
      `User lists can contain at most ${USER_LIST_MEMBER_LIMIT.toLocaleString()} members.`,
    );
  }
  const invalid = rawPersonIds
    .filter((personId) => !normalizeWcaId(personId))
    .map((personId) => String(personId).slice(0, 40));

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const publicId = generateListPublicId();
    try {
      const membership = await withTransaction(async (connection) => {
        const [result] = await connection.execute<ResultSetHeader>(
          createListQuery(),
          [publicId, user.id, name, slug, description, visibility, joinPolicy],
        );
        const listId = Number(result.insertId);
        const valid = new Set<string>();
        const blocked = new Set<string>();
        let addedCount = 0;
        if (normalizedPersonIds.length) {
          const [people] = await connection.execute<
            (RowDataPacket & { wca_id: string })[]
          >(
            personIdsForListQuery(normalizedPersonIds.length),
            normalizedPersonIds,
          );
          people.forEach((person) => valid.add(person.wca_id));
          const validIds = normalizedPersonIds.filter((personId) =>
            valid.has(personId),
          );
          if (validIds.length) {
            const [optedOut] = await connection.execute<
              (RowDataPacket & { wca_id: string })[]
            >(optedOutPersonIdsQuery(validIds.length), validIds);
            optedOut.forEach((person) => blocked.add(person.wca_id));
            const added = validIds.filter((personId) => !blocked.has(personId));
            if (added.length) {
              addedCount = added.length;
              await connection.execute(
                insertBulkListMembersQuery(added.length),
                added.flatMap((personId) => [listId, personId, user.id]),
              );
              await connection.execute(updateListMemberCountQuery(), [
                added.length,
                listId,
              ]);
            }
          }
        }
        await activity(connection, {
          listId,
          actorUserId: user.id,
          eventType: "list.created",
          eventData: {
            visibility,
            joinPolicy,
            memberCount: normalizedPersonIds.length,
          },
        });
        await enqueueListRankingRebuild(connection, {
          id: listId,
          membershipVersion: addedCount ? 2 : 1,
          kind: "user",
        });
        return {
          invalid: [
            ...invalid,
            ...normalizedPersonIds.filter((personId) => !valid.has(personId)),
          ],
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
  if (source.memberCount > USER_LIST_MEMBER_LIMIT) {
    throw new ListValidationError(
      `Lists with more than ${USER_LIST_MEMBER_LIMIT.toLocaleString()} members cannot be cloned.`,
    );
  }
  const name = validateName(`${source.name.slice(0, 95)} copy`);
  const slug = slugifyListName(name);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const publicId = generateListPublicId();
    try {
      await withTransaction(async (connection) => {
        const [created] = await connection.execute<ResultSetHeader>(
          cloneListQuery(),
          [publicId, user.id, name, slug, source.description],
        );
        const listId = Number(created.insertId);
        const [members] = await connection.execute<ResultSetHeader>(
          cloneListMembersQuery(),
          [listId, user.id, source.id],
        );
        await connection.execute(updateListMemberCountQuery(), [
          members.affectedRows,
          listId,
        ]);
        await activity(connection, {
          listId,
          actorUserId: user.id,
          eventType: "list.cloned",
          eventData: {
            sourceListId: source.publicId ?? source.systemAlias,
            memberCount: members.affectedRows,
          },
        });
        await enqueueListRankingRebuild(connection, {
          id: listId,
          membershipVersion: 2,
          kind: "user",
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
    listMemberIdsQuery(),
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
    await connection.execute(updateListQuery(), [
      name,
      slugifyListName(name),
      description,
      visibility,
      joinPolicy,
      row.id,
    ]);
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
    await connection.execute(deleteListQuery(), [row.id]);
  });
}

export async function listOwnedLists(user: AuthUser) {
  const result = await query<ListRow>(ownedListsQuery(), [user.id]);
  return result.rows.map(toListSummary);
}

export async function listPublicLists() {
  const result = await query<ListRow>(publicListsQuery());
  return result.rows.map((row): PublicListSummary => {
    const list = toListSummary(row);
    return {
      publicId: list.publicId,
      systemAlias: list.systemAlias,
      slug: list.slug,
      name: list.name,
      memberCount: list.memberCount,
      kind: list.kind,
      createdBy:
        list.kind === "system" ? null : (list.owner?.name ?? "WCA member"),
    };
  });
}

export async function listContainingUser(user: AuthUser) {
  const result = await query<ListRow>(containingUserListsQuery(), [user.wcaId]);
  return result.rows.map(toListSummary);
}

export async function getListMembershipState(
  list: ListSummary,
  user: AuthUser | null,
): Promise<ListMembershipState | null> {
  if (!user) return null;
  const membership = await query<RowDataPacket>(listMembershipQuery(), [
    list.id,
    user.wcaId,
  ]);
  if (membership.rows.length > 0) return "member";

  // System lists do not accept membership requests, but their membership is
  // still useful for list-scoped UI such as the "My rank" action.
  if (list.kind !== "user") return "not_member";

  const request = await query<RowDataPacket>(pendingMembershipRequestQuery(), [
    list.id,
    user.wcaId,
  ]);
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
  const result = await query<MemberRow>(listMembersQuery(), [
    list.id,
    after.trim().toUpperCase(),
    pageSize + 1,
  ]);
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
      result.rows.length > pageSize ? (rows.at(-1)?.person_id ?? null) : null,
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
    throw new ListValidationError(
      "A single request can add at most 1,000 people.",
    );
  }
  const normalized = [
    ...new Set(rawPersonIds.map(normalizeWcaId).filter(Boolean)),
  ] as string[];
  const invalid = rawPersonIds
    .filter((value) => !normalizeWcaId(value))
    .map((value) => String(value).slice(0, 40));

  return withTransaction(async (connection) => {
    const row = await selectListForUpdate(connection, lookup);
    assertOwner(row, user);
    if (normalized.length === 0) {
      return { added: [], duplicates: [], invalid, blocked: [] };
    }
    const [personRows] = await connection.execute<
      (RowDataPacket & { wca_id: string })[]
    >(validPersonIdsQuery(normalized.length), normalized);
    const valid = new Set(personRows.map((person) => person.wca_id));
    for (const personId of normalized) {
      if (!valid.has(personId)) invalid.push(personId);
    }
    const candidates = normalized.filter((personId) => valid.has(personId));
    if (candidates.length === 0) {
      return { added: [], duplicates: [], invalid, blocked: [] };
    }
    const [blockedRows] = await connection.execute<
      (RowDataPacket & { wca_id: string })[]
    >(blockedPersonIdsQuery(candidates.length), candidates);
    const [excludedRows] = await connection.execute<
      (RowDataPacket & { person_id: string })[]
    >(excludedPersonIdsQuery(candidates.length), [row.id, ...candidates]);
    const [existingRows] = await connection.execute<
      (RowDataPacket & { person_id: string })[]
    >(existingListMemberIdsQuery(candidates.length), [row.id, ...candidates]);
    const blockedSet = new Set([
      ...blockedRows.map((blocked) => blocked.wca_id),
      ...excludedRows.map((excluded) => excluded.person_id),
    ]);
    const existing = new Set(existingRows.map((member) => member.person_id));
    const added = candidates.filter(
      (personId) => !blockedSet.has(personId) && !existing.has(personId),
    );
    ensureListMemberCapacity(row.kind, Number(row.member_count), added.length);
    if (added.length > 0) {
      await connection.execute(
        insertListMembersQuery(added.length),
        added.flatMap((personId) => [row.id, personId, user.id, source]),
      );
      await connection.execute(incrementListMemberCountQuery(), [
        added.length,
        row.id,
      ]);
      await activity(connection, {
        listId: Number(row.id),
        actorUserId: user.id,
        eventType: "members.added",
        eventData: { count: added.length, source },
      });
      await enqueueListRankingRebuild(connection, {
        id: Number(row.id),
        membershipVersion: Number(row.membership_version) + 1,
        kind: row.kind,
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
      deleteListMemberQuery(),
      [row.id, personId],
    );
    if (result.affectedRows > 0) {
      await connection.execute(decrementListMemberCountQuery(), [row.id]);
      await activity(connection, {
        listId: Number(row.id),
        actorUserId: user.id,
        eventType: "member.removed_by_owner",
        personId,
      });
      await enqueueListRankingRebuild(connection, {
        id: Number(row.id),
        membershipVersion: Number(row.membership_version) + 1,
        kind: row.kind,
      });
    }
    return result.affectedRows > 0;
  });
}

export async function removeSelfFromList(user: AuthUser, lookup: string) {
  return withTransaction(async (connection) => {
    const row = await selectListForUpdate(connection, lookup);
    const [result] = await connection.execute<ResultSetHeader>(
      deleteListMemberQuery(),
      [row.id, user.wcaId],
    );
    if (result.affectedRows === 0) {
      throw new ListConflictError(
        "You are not currently included in this list.",
      );
    }
    await connection.execute(insertListExclusionQuery(), [row.id, user.wcaId]);
    await connection.execute(decrementListMemberCountQuery(), [row.id]);
    await activity(connection, {
      listId: Number(row.id),
      actorUserId: user.id,
      eventType: "member.self_removed",
      personId: user.wcaId,
    });
    await enqueueListRankingRebuild(connection, {
      id: Number(row.id),
      membershipVersion: Number(row.membership_version) + 1,
      kind: row.kind,
    });
  });
}

export async function requestListMembership(user: AuthUser, lookup: string) {
  if (!user.allowListInclusion) {
    throw new ListConflictError(
      "Enable list inclusion before requesting membership.",
    );
  }
  return withTransaction(async (connection) => {
    const row = await selectListForUpdate(connection, lookup);
    if (row.kind !== "user" || row.visibility !== "public") {
      throw new ListNotFoundError();
    }
    const [memberRows] = await connection.execute<RowDataPacket[]>(
      listMembershipQuery(),
      [row.id, user.wcaId],
    );
    if (memberRows.length > 0) {
      throw new ListConflictError("You are already included in this list.");
    }
    if (row.join_policy === "open") {
      ensureListMemberCapacity(row.kind, Number(row.member_count), 1);
      await connection.execute(deleteListExclusionQuery(), [
        row.id,
        user.wcaId,
      ]);
      const [insert] = await connection.execute<ResultSetHeader>(
        insertSelfRequestMemberQuery(),
        [row.id, user.wcaId, user.id],
      );
      if (insert.affectedRows > 0) {
        await connection.execute(incrementListMemberCountQuery(), [row.id]);
        await enqueueListRankingRebuild(connection, {
          id: Number(row.id),
          membershipVersion: Number(row.membership_version) + 1,
          kind: row.kind,
        });
      }
      await activity(connection, {
        listId: Number(row.id),
        actorUserId: user.id,
        eventType: "membership.joined",
        personId: user.wcaId,
      });
      return { status: "joined" as const };
    }
    await connection.execute(insertMembershipRequestQuery(), [
      row.id,
      user.id,
      user.wcaId,
    ]);
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
  const result = await query<RequestRow>(membershipRequestsQuery(), [list.id]);
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
    const [requests] = await connection.execute<(RequestRow & RowDataPacket)[]>(
      membershipRequestForUpdateQuery(),
      [requestId, list.id],
    );
    const request = requests[0];
    if (!request || request.status !== "pending") {
      throw new ListConflictError(
        "This membership request is no longer pending.",
      );
    }

    let added = false;
    if (decision === "accepted") {
      ensureListMemberCapacity(list.kind, Number(list.member_count), 1);
      const [preferenceRows] = await connection.execute<
        (RowDataPacket & { allow_list_inclusion: number })[]
      >(listInclusionPreferenceQuery(), [request.requester_user_id]);
      if (!preferenceRows[0]?.allow_list_inclusion) {
        throw new ListConflictError("This person cannot be added.");
      }
      await connection.execute(deleteListExclusionQuery(), [
        list.id,
        request.person_id,
      ]);
      const [insert] = await connection.execute<ResultSetHeader>(
        insertSelfRequestMemberQuery(),
        [list.id, request.person_id, user.id],
      );
      added = insert.affectedRows > 0;
      if (added) {
        await connection.execute(incrementListMemberCountQuery(), [list.id]);
        await enqueueListRankingRebuild(connection, {
          id: Number(list.id),
          membershipVersion: Number(list.membership_version) + 1,
          kind: list.kind,
        });
      }
    }
    await connection.execute(updateMembershipRequestQuery(), [
      decision,
      user.id,
      request.id,
    ]);
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
    await connection.execute(updateListInclusionPreferenceQuery(), [
      allowListInclusion,
      user.id,
    ]);
    if (allowListInclusion) return;

    const [affectedLists] = await connection.execute<
      (RowDataPacket & {
        id: number;
        kind: "user" | "system";
        membership_version: number;
      })[]
    >(
      `SELECT list_record.id, list_record.kind, list_record.membership_version
       FROM lists AS list_record
       JOIN list_members AS member ON member.list_id = list_record.id
       WHERE member.person_id = ? FOR UPDATE`,
      [user.wcaId],
    );
    await connection.execute(removeUserFromListsQuery(), [user.wcaId]);
    await connection.execute(removeUserListMembersQuery(), [user.wcaId]);
    for (const list of affectedLists) {
      await enqueueListRankingRebuild(connection, {
        id: Number(list.id),
        membershipVersion: Number(list.membership_version) + 1,
        kind: list.kind,
      });
    }
    await connection.execute(cancelUserMembershipRequestsQuery(), [
      user.id,
      user.wcaId,
    ]);
    await activity(connection, {
      listId: null,
      actorUserId: user.id,
      eventType: "preference.list_inclusion_disabled",
      personId: user.wcaId,
    });
  });
}
