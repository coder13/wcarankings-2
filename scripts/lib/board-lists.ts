import type { Connection, ResultSetHeader } from "mysql2/promise";
import { enqueueListRankingRebuild } from "./list-ranking-jobs.ts";
import type {
  ListRow,
  PersonIdRow,
  RoleListDefinition,
  WcaRole,
} from "./list-types.ts";

const ROLE_LISTS: Record<string, RoleListDefinition> = {
  board: {
    key: "wca-board",
    alias: "board",
    version: 1,
    name: "Board",
    description: null,
    rolesUrl:
      "https://www.worldcubeassociation.org/api/v0/user_roles?sort=name&isActive=true&groupType=board&per_page=100",
  },
  delegates: {
    key: "wca-delegates",
    alias: "delegates",
    version: 1,
    name: "Delegates",
    description: null,
    rolesUrl:
      "https://www.worldcubeassociation.org/api/v0/user_roles?sort=name&isActive=true&groupType=delegate_regions&isLead=false&per_page=1000",
  },
};
const WCA_ID_PATTERN = /^\d{4}[A-Z0-9]{4}\d{2}$/;

function rolePayload(value: unknown): WcaRole[] {
  if (Array.isArray(value)) return value.filter(isWcaRole);
  if (!isRecord(value) || !Array.isArray(value.user_roles)) return [];
  return value.user_roles.filter(isWcaRole);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWcaRole(value: unknown): value is WcaRole {
  if (!isRecord(value)) return false;
  return value.user === undefined || isRecord(value.user);
}

export function roleMemberIds(payload: unknown): string[] {
  const roles = rolePayload(payload);
  return [
    ...new Set(
      roles
        .map((role: WcaRole) =>
          String(role?.user?.wca_id ?? "")
            .trim()
            .toUpperCase(),
        )
        .filter((wcaId: string) => WCA_ID_PATTERN.test(wcaId)),
    ),
  ];
}

async function fetchRoleMemberIds(
  roleList: RoleListDefinition,
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  const response = await fetchImpl(roleList.rolesUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "WCA-Rankings-Board-List-Refresh/1.0",
    },
  });
  if (!response.ok)
    throw new Error(
      `WCA ${roleList.alias} roles API returned ${response.status}.`,
    );
  return roleMemberIds(await response.json());
}

async function refreshRoleList(
  connection: Connection,
  roleList: RoleListDefinition,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const memberIds = await fetchRoleMemberIds(roleList, fetchImpl);
  await connection.beginTransaction();
  try {
    await connection.query(
      `INSERT INTO lists
        (kind, system_alias, system_key, system_definition_version, name, slug, description, visibility)
       VALUES ('system', ?, ?, ?, ?, ?, ?, 'public')
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         slug = VALUES(slug),
         description = VALUES(description)`,
      [
        roleList.alias,
        roleList.key,
        roleList.version,
        roleList.name,
        roleList.alias,
        roleList.description,
      ],
    );
    const [listRows] = await connection.query<ListRow[]>(
      `SELECT id, system_definition_version, membership_version
       FROM lists
       WHERE kind = 'system' AND system_key = ? AND system_alias = ? AND deleted_at IS NULL
       LIMIT 1 FOR UPDATE`,
      [roleList.key, roleList.alias],
    );
    const listId = listRows[0]?.id;
    if (!listId)
      throw new Error(`${roleList.name} system list could not be created.`);
    const memberPlaceholders = memberIds.map(() => "?").join(", ");
    let blockedRows: PersonIdRow[] = [];
    if (memberIds.length > 0) {
      [blockedRows] = await connection.query<PersonIdRow[]>(
        `SELECT wca_id AS person_id
         FROM app_users
         WHERE allow_list_inclusion = FALSE AND wca_id IN (${memberPlaceholders})
         UNION
         SELECT person_id
         FROM list_exclusions
         WHERE list_id = ? AND person_id IN (${memberPlaceholders})`,
        [...memberIds, listId, ...memberIds],
      );
    }
    const blocked = new Set(
      blockedRows.map((row: PersonIdRow) => row.person_id),
    );
    const eligibleMemberIds = memberIds.filter(
      (memberId) => !blocked.has(memberId),
    );
    const placeholders = eligibleMemberIds.map(() => "?").join(", ");
    const [removed] =
      eligibleMemberIds.length > 0
        ? await connection.query<ResultSetHeader>(
            `DELETE FROM list_members
         WHERE list_id = ? AND source = 'system_rule' AND person_id NOT IN (${placeholders})`,
            [listId, ...eligibleMemberIds],
          )
        : await connection.query<ResultSetHeader>(
            "DELETE FROM list_members WHERE list_id = ? AND source = 'system_rule'",
            [listId],
          );
    let insertedCount = 0;
    if (eligibleMemberIds.length > 0) {
      const [inserted] = await connection.query<ResultSetHeader>(
        `INSERT IGNORE INTO list_members (list_id, person_id, added_by_user_id, source)
         VALUES ${eligibleMemberIds.map(() => "(?, ?, NULL, 'system_rule')").join(", ")}`,
        eligibleMemberIds.flatMap((memberId) => [listId, memberId]),
      );
      insertedCount = inserted.affectedRows;
    }
    const changed =
      removed.affectedRows > 0 ||
      insertedCount > 0 ||
      Number(listRows[0].system_definition_version) !== roleList.version;
    await connection.query(
      `UPDATE lists
       SET member_count = (SELECT COUNT(*) FROM list_members WHERE list_id = ?),
           membership_version = membership_version + ?,
           system_definition_version = ?,
           name = ?,
           description = ?,
           updated_at = CURRENT_TIMESTAMP(6)
       WHERE id = ?`,
      [
        listId,
        changed ? 1 : 0,
        roleList.version,
        roleList.name,
        roleList.description,
        listId,
      ],
    );
    if (changed) {
      await enqueueListRankingRebuild(connection, {
        id: Number(listId),
        membershipVersion: Number(listRows[0].membership_version) + 1,
        kind: "system",
      });
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

export async function refreshBoardList(
  connection: Connection,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  return refreshRoleList(connection, ROLE_LISTS.board, fetchImpl);
}

export async function refreshDelegatesList(
  connection: Connection,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  return refreshRoleList(connection, ROLE_LISTS.delegates, fetchImpl);
}
