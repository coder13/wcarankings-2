import type { Connection, ResultSetHeader } from "mysql2/promise";
import { SYSTEM_LIST_DEFINITIONS } from "./system-list-definitions.ts";
import { enqueueListRankingRebuild } from "./list-ranking-jobs.ts";
import type { ListRow } from "./list-types.ts";

export async function refreshSystemLists(
  connection: Connection,
): Promise<void> {
  await connection.beginTransaction();
  try {
    for (const definition of SYSTEM_LIST_DEFINITIONS) {
      const [listRows] = await connection.query<ListRow[]>(
        `SELECT id, system_definition_version, membership_version
         FROM lists
         WHERE kind = 'system'
           AND system_key = ?
           AND system_alias = ?
           AND deleted_at IS NULL
         LIMIT 1
         FOR UPDATE`,
        [definition.key, definition.alias],
      );
      const listId = listRows[0]?.id;
      if (!listId) {
        throw new Error(
          `System list ${definition.alias} is missing. Run Flyway migrations first.`,
        );
      }

      const [removed] = await connection.query<ResultSetHeader>(
        `DELETE member
         FROM list_members AS member
         LEFT JOIN persons AS person
           ON person.wca_id = member.person_id
          AND person.sub_id = 1
         LEFT JOIN app_users AS app_user
           ON app_user.wca_id = member.person_id
         LEFT JOIN list_exclusions AS exclusion
           ON exclusion.list_id = member.list_id
          AND exclusion.person_id = member.person_id
         WHERE member.list_id = ?
           AND member.source = 'system_rule'
           AND (
             person.wca_id IS NULL
             OR LOWER(
               SUBSTRING_INDEX(
                 TRIM(SUBSTRING_INDEX(person.name, '(', 1)),
                 ' ',
                 1
               )
             ) <> ?
             OR app_user.allow_list_inclusion = FALSE
             OR exclusion.person_id IS NOT NULL
           )`,
        [listId, definition.token],
      );
      const [inserted] = await connection.query<ResultSetHeader>(
        `INSERT IGNORE INTO list_members (list_id, person_id, added_by_user_id, source)
         SELECT ?, person.wca_id, NULL, 'system_rule'
         FROM persons AS person
         LEFT JOIN app_users AS app_user
           ON app_user.wca_id = person.wca_id
         LEFT JOIN list_exclusions AS exclusion
           ON exclusion.list_id = ?
          AND exclusion.person_id = person.wca_id
         WHERE person.sub_id = 1
           AND LOWER(
             SUBSTRING_INDEX(
               TRIM(SUBSTRING_INDEX(person.name, '(', 1)),
               ' ',
               1
             )
           ) = ?
           AND (app_user.id IS NULL OR app_user.allow_list_inclusion = TRUE)
           AND exclusion.person_id IS NULL`,
        [listId, listId, definition.token],
      );
      const changed =
        removed.affectedRows > 0 ||
        inserted.affectedRows > 0 ||
        Number(listRows[0].system_definition_version) !== definition.version;
      await connection.query(
        `UPDATE lists
         SET
           member_count = (
             SELECT COUNT(*)
             FROM list_members
             WHERE list_id = ?
           ),
           membership_version = membership_version + ?,
           system_definition_version = ?,
           name = ?,
           description = ?,
           updated_at = CURRENT_TIMESTAMP(6)
         WHERE id = ?`,
        [
          listId,
          changed ? 1 : 0,
          definition.version,
          definition.name,
          definition.description,
          listId,
        ],
      );
      if (changed) {
        await enqueueListRankingRebuild(connection, {
          id: Number(listId),
          membershipVersion: Number(listRows[0].membership_version ?? 1) + 1,
          kind: "system",
        });
      }
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}
