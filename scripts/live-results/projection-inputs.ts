import type { Connection } from "mysql2/promise";

/** Creates live-aware input views only after the raw export tables exist. */
export async function prepareLiveProjectionInputs(connection: Connection): Promise<void> {
  await connection.query(`CREATE OR REPLACE VIEW results_with_live AS
    SELECT id, competition_id, event_id, round_type_id, pos, best, average, person_name,
      person_id, person_country_id, format_id, regional_single_record, regional_average_record
    FROM results
    UNION ALL
    SELECT -CAST(live.projection_result_id AS SIGNED), live.competition_id, live.event_id,
      live.round_type_id, live.position, live.best, live.average, live.person_name, live.person_id,
      COALESCE(country.id, person.country_id, ''),
      COALESCE(live.format_id, CASE JSON_LENGTH(live.attempts_json)
        WHEN 1 THEN '1' WHEN 2 THEN '2' WHEN 3 THEN '3' ELSE 'a' END), '', ''
    FROM provisional_live_results live
    JOIN provisional_live_result_sources source
      ON source.source_name = live.source_name AND source.competition_id = live.competition_id
    LEFT JOIN countries country ON country.iso2 = live.country_iso2
    LEFT JOIN persons person ON person.wca_id = live.person_id AND person.sub_id = 1
    WHERE source.enabled = 1`);
  await connection.query(`CREATE OR REPLACE VIEW result_attempts_with_live AS
    SELECT result_id, attempt_number, result FROM result_attempts
    UNION ALL
    SELECT -CAST(live.projection_result_id AS SIGNED), attempts.attempt_number, attempts.result
    FROM provisional_live_results live
    JOIN provisional_live_result_sources source
      ON source.source_name = live.source_name AND source.competition_id = live.competition_id
    JOIN JSON_TABLE(live.attempts_json, '$[*]' COLUMNS (
      attempt_number FOR ORDINALITY,
      result INT PATH '$'
    )) attempts
    WHERE source.enabled = 1`);
}
