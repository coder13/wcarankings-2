import type {
  ListLookupQueryInput,
  ListRankingQueryInput,
} from "@/services/lists/types";
import { sqlFragment } from "@/lib/helpers/database/sql";

export const LIST_COLUMNS = `
  l.id, l.public_id, l.system_alias, l.kind, l.owner_user_id,
  owner.name AS owner_name, owner.wca_id AS owner_wca_id,
  l.name, l.slug, l.description, l.visibility, l.join_policy,
  l.member_count, l.membership_version, l.system_definition_version,
  l.created_at, l.updated_at`;

export function listLookupQuery(input: ListLookupQueryInput) {
  return sqlFragment`SELECT ${input.listColumns}
    FROM lists AS l
    LEFT JOIN app_users AS owner ON owner.id = l.owner_user_id
    WHERE ${input.byPublicId ? "l.public_id = ?" : "l.system_alias = ?"}
      AND l.deleted_at IS NULL
    LIMIT 1${input.forUpdate ? " FOR UPDATE" : ""}`;
}
export function listActivityQuery() {
  return sqlFragment`INSERT INTO list_activity_events (list_id, actor_user_id, event_type, person_id, event_data) VALUES (?, ?, ?, ?, ?)`;
}
export function createListQuery() {
  return sqlFragment`INSERT INTO lists (kind, public_id, owner_user_id, name, slug, description, visibility, join_policy) VALUES ('user', ?, ?, ?, ?, ?, ?, ?)`;
}
export function personIdsForListQuery(count: number) {
  return sqlFragment`SELECT wca_id FROM persons WHERE sub_id = 1 AND wca_id IN (${placeholders(count)})`;
}
export function optedOutPersonIdsQuery(count: number) {
  return sqlFragment`SELECT wca_id FROM app_users WHERE allow_list_inclusion = FALSE AND wca_id IN (${placeholders(count)})`;
}
export function insertBulkListMembersQuery(count: number) {
  return sqlFragment`INSERT INTO list_members (list_id, person_id, added_by_user_id, source) VALUES ${Array.from({ length: count }, () => "(?, ?, ?, 'bulk_import')").join(",")}`;
}
export function updateListMemberCountQuery() {
  return "UPDATE lists SET member_count = ?, membership_version = membership_version + 1 WHERE id = ?";
}
export function cloneListQuery() {
  return sqlFragment`INSERT INTO lists (kind, public_id, owner_user_id, name, slug, description, visibility, join_policy) VALUES ('user', ?, ?, ?, ?, ?, 'private', 'closed')`;
}
export function cloneListMembersQuery() {
  return sqlFragment`INSERT INTO list_members (list_id, person_id, added_by_user_id, source) SELECT ?, person_id, ?, 'bulk_import' FROM list_members WHERE list_id = ?`;
}
export function listMemberIdsQuery() {
  return "SELECT person_id FROM list_members WHERE list_id = ? ORDER BY person_id";
}
export function updateListQuery() {
  return "UPDATE lists SET name = ?, slug = ?, description = ?, visibility = ?, join_policy = ? WHERE id = ?";
}
export function deleteListQuery() {
  return "UPDATE lists SET deleted_at = CURRENT_TIMESTAMP(6) WHERE id = ?";
}
export function ownedListsQuery() {
  return sqlFragment`SELECT ${LIST_COLUMNS} FROM lists AS l LEFT JOIN app_users AS owner ON owner.id = l.owner_user_id WHERE l.owner_user_id = ? AND l.deleted_at IS NULL ORDER BY l.updated_at DESC, l.id DESC`;
}
export function publicListsQuery() {
  return sqlFragment`SELECT ${LIST_COLUMNS} FROM lists AS l LEFT JOIN app_users AS owner ON owner.id = l.owner_user_id WHERE l.visibility = 'public' AND l.deleted_at IS NULL ORDER BY l.kind = 'system' DESC, l.name ASC, l.id ASC`;
}
export function containingUserListsQuery() {
  return sqlFragment`SELECT ${LIST_COLUMNS} FROM list_members AS member JOIN lists AS l ON l.id = member.list_id LEFT JOIN app_users AS owner ON owner.id = l.owner_user_id WHERE member.person_id = ? AND l.deleted_at IS NULL ORDER BY l.updated_at DESC, l.id DESC`;
}
export function listMembershipQuery() {
  return "SELECT 1 FROM list_members WHERE list_id = ? AND person_id = ? LIMIT 1";
}
export function pendingMembershipRequestQuery() {
  return "SELECT 1 FROM list_membership_requests WHERE list_id = ? AND person_id = ? AND status = 'pending' LIMIT 1";
}
export function listMembersQuery() {
  return sqlFragment`SELECT member.person_id, person.name AS person_name, person.country_id, member.source, member.created_at FROM list_members AS member LEFT JOIN persons AS person ON person.wca_id = member.person_id AND person.sub_id = 1 WHERE member.list_id = ? AND member.person_id > ? ORDER BY member.person_id LIMIT ?`;
}
export function validPersonIdsQuery(count: number) {
  return sqlFragment`SELECT wca_id FROM persons WHERE sub_id = 1 AND wca_id IN (${placeholders(count)})`;
}
export function blockedPersonIdsQuery(count: number) {
  return sqlFragment`SELECT user.wca_id FROM app_users AS user WHERE user.wca_id IN (${placeholders(count)}) AND user.allow_list_inclusion = FALSE FOR UPDATE`;
}
export function excludedPersonIdsQuery(count: number) {
  return sqlFragment`SELECT person_id FROM list_exclusions WHERE list_id = ? AND person_id IN (${placeholders(count)}) FOR UPDATE`;
}
export function existingListMemberIdsQuery(count: number) {
  return sqlFragment`SELECT person_id FROM list_members WHERE list_id = ? AND person_id IN (${placeholders(count)}) FOR UPDATE`;
}
export function insertListMembersQuery(count: number) {
  return sqlFragment`INSERT INTO list_members (list_id, person_id, added_by_user_id, source) VALUES ${Array.from({ length: count }, () => "(?, ?, ?, ?)").join(",")}`;
}
export function incrementListMemberCountQuery() {
  return "UPDATE lists SET member_count = member_count + ?, membership_version = membership_version + 1 WHERE id = ?";
}
export function deleteListMemberQuery() {
  return "DELETE FROM list_members WHERE list_id = ? AND person_id = ?";
}
export function decrementListMemberCountQuery() {
  return "UPDATE lists SET member_count = GREATEST(0, member_count - 1), membership_version = membership_version + 1 WHERE id = ?";
}
export function insertListExclusionQuery() {
  return "INSERT INTO list_exclusions (list_id, person_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE created_at = CURRENT_TIMESTAMP(6)";
}
export function insertSelfRequestMemberQuery() {
  return sqlFragment`INSERT IGNORE INTO list_members (list_id, person_id, added_by_user_id, source) VALUES (?, ?, ?, 'self_request')`;
}
export function deleteListExclusionQuery() {
  return "DELETE FROM list_exclusions WHERE list_id = ? AND person_id = ?";
}
export function insertMembershipRequestQuery() {
  return sqlFragment`INSERT INTO list_membership_requests (list_id, requester_user_id, person_id, status, created_at, resolved_at, resolved_by_user_id) VALUES (?, ?, ?, 'pending', CURRENT_TIMESTAMP(6), NULL, NULL) ON DUPLICATE KEY UPDATE requester_user_id = VALUES(requester_user_id), status = 'pending', created_at = CURRENT_TIMESTAMP(6), resolved_at = NULL, resolved_by_user_id = NULL`;
}
export function membershipRequestsQuery() {
  return sqlFragment`SELECT request.id, request.list_id, request.requester_user_id, request.person_id, requester.name AS requester_name, request.status, request.created_at, request.resolved_at FROM list_membership_requests AS request JOIN app_users AS requester ON requester.id = request.requester_user_id WHERE request.list_id = ? AND request.status = 'pending' ORDER BY request.created_at`;
}
export function membershipRequestForUpdateQuery() {
  return sqlFragment`SELECT request.id, request.list_id, request.requester_user_id, request.person_id, requester.name AS requester_name, request.status, request.created_at, request.resolved_at FROM list_membership_requests AS request JOIN app_users AS requester ON requester.id = request.requester_user_id WHERE request.id = ? AND request.list_id = ? LIMIT 1 FOR UPDATE`;
}
export function listInclusionPreferenceQuery() {
  return "SELECT allow_list_inclusion FROM app_users WHERE id = ? FOR UPDATE";
}
export function updateMembershipRequestQuery() {
  return "UPDATE list_membership_requests SET status = ?, resolved_at = CURRENT_TIMESTAMP(6), resolved_by_user_id = ? WHERE id = ?";
}
export function updateListInclusionPreferenceQuery() {
  return "UPDATE app_users SET allow_list_inclusion = ? WHERE id = ?";
}
export function removeUserFromListsQuery() {
  return "UPDATE lists AS list_record JOIN (SELECT list_id, COUNT(*) AS removed_count FROM list_members WHERE person_id = ? GROUP BY list_id) AS removed ON removed.list_id = list_record.id SET list_record.member_count = GREATEST(0, list_record.member_count - removed.removed_count), list_record.membership_version = list_record.membership_version + 1";
}
export function removeUserListMembersQuery() {
  return "DELETE FROM list_members WHERE person_id = ?";
}
export function cancelUserMembershipRequestsQuery() {
  return "UPDATE list_membership_requests SET status = 'cancelled', resolved_at = CURRENT_TIMESTAMP(6), resolved_by_user_id = ? WHERE person_id = ? AND status = 'pending'";
}
export function listRankingsQuery(input: ListRankingQueryInput) {
  return sqlFragment`WITH scoped_rankings AS (SELECT RANK() OVER (ORDER BY ranking.best) AS rank, ROW_NUMBER() OVER (ORDER BY ranking.best, ranking.person_name, ranking.person_id) AS sub_rank, COUNT(*) OVER () AS total, ranking.person_id, ranking.person_name, ranking.country_id, ranking.country_name, ranking.country_iso2, ranking.continent_id, ranking.best, ranking.competition_id, ranking.competition_name, ranking.is_world_record, ranking.is_continent_record, ranking.is_country_record FROM ${input.source} JOIN persons AS person_gender ON person_gender.wca_id = ranking.person_id AND person_gender.sub_id = 1 WHERE ${input.scopedConditions.join("\n AND ")}) SELECT * FROM scoped_rankings WHERE ${input.conditions.join(" AND ")} ORDER BY sub_rank LIMIT ?`;
}
export function listRegionsQuery() {
  return sqlFragment`SELECT DISTINCT country.id AS country_id, country.name AS country_name, country.iso2 AS country_iso2, country.continent_id FROM list_members AS member JOIN persons AS person ON person.wca_id = member.person_id AND person.sub_id = 1 JOIN countries AS country ON country.id = person.country_id WHERE member.list_id = ? ORDER BY country.name, country.id`;
}
export function dynamicListRegionsQuery(count: number) {
  return sqlFragment`SELECT DISTINCT country.id AS country_id, country.name AS country_name, country.iso2 AS country_iso2, country.continent_id FROM persons AS person JOIN countries AS country ON country.id = person.country_id WHERE person.sub_id = 1 AND person.wca_id IN (${placeholders(count)}) ORDER BY country.name, country.id`;
}
export function dynamicListPeopleQuery(count: number) {
  return sqlFragment`SELECT wca_id FROM persons WHERE sub_id = 1 AND wca_id IN (${placeholders(count)})`;
}

function placeholders(count: number) {
  return Array.from({ length: count }, () => "?").join(",");
}
