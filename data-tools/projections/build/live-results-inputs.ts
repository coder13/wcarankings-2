import type { Connection } from "mysql2/promise";

/**
 * Creates the input views used by the daily official build.
 *
 * Live rows are projected separately by the live worker. Do not union them
 * here: the daily build publishes official rows only.
 */
export async function prepareLiveProjectionInputs(
  connection: Connection,
): Promise<void> {
  await connection.query(`CREATE OR REPLACE VIEW results_with_live AS
    SELECT id,
      competition_id COLLATE utf8mb4_unicode_ci AS competition_id,
      event_id COLLATE utf8mb4_unicode_ci AS event_id,
      round_type_id COLLATE utf8mb4_unicode_ci AS round_type_id,
      pos, best, average,
      person_name COLLATE utf8mb4_unicode_ci AS person_name,
      person_id COLLATE utf8mb4_unicode_ci AS person_id,
      person_country_id COLLATE utf8mb4_unicode_ci AS person_country_id,
      format_id COLLATE utf8mb4_unicode_ci AS format_id,
      regional_single_record COLLATE utf8mb4_unicode_ci AS regional_single_record,
      regional_average_record COLLATE utf8mb4_unicode_ci AS regional_average_record
    FROM results`);
  await connection.query(`CREATE OR REPLACE VIEW result_attempts_with_live AS
    SELECT result_id, attempt_number, value FROM result_attempts`);
}
