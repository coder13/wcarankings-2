export function exportMetadataQuery() {
  return "SELECT `key`, value FROM export_metadata WHERE `key` IN ('export_date', 'export_format_version', 'fetched_at')";
}
export function latestImportRunQuery() {
  return "SELECT * FROM import_runs ORDER BY id DESC LIMIT 1";
}
export function successfulImportRunQuery() {
  return "SELECT * FROM import_runs WHERE status = 'succeeded' ORDER BY id DESC LIMIT 1";
}
export function failedImportRunsQuery() {
  return "SELECT * FROM import_runs WHERE status = 'failed' ORDER BY id DESC LIMIT 5";
}
export function projectionTablesQuery() {
  return sqlFragment`SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('ranking_entries_single', 'ranking_entries_average', 'ranking_counts', 'person_sum_of_ranks_scores', 'competition_podium_members', 'competition_event_stats')`;
}
import { sqlFragment } from "@/lib/helpers/database/sql";
