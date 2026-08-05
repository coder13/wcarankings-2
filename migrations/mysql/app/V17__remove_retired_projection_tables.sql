UPDATE ranking_generation_state state
SET
  capabilities_json = JSON_SET(
    state.capabilities_json,
    '$.core',
    (
      SELECT
        COUNT(*) = 3
      FROM
        information_schema.tables
      WHERE
        table_schema = DATABASE ()
        AND table_name IN (
          'ranking_entries_single',
          'ranking_entries_average',
          'ranking_counts'
        )
    )
  )
WHERE
  state.id = 1;

DROP TABLE IF EXISTS result_gender_ranking_counts,
result_gender_rankings_single,
result_gender_rankings_average;
