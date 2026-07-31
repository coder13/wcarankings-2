ALTER TABLE ranking_generation_state
  ADD COLUMN capabilities_json LONGTEXT NULL AFTER fingerprints_json;

UPDATE ranking_generation_state state
SET state.capabilities_json = JSON_OBJECT(
  'core', (
    SELECT COUNT(*) = 5
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name IN (
        'ranking_entries_single', 'ranking_entries_average', 'ranking_counts',
        'result_entries_single', 'result_counts'
      )
  ),
  'resultRankings', (
    SELECT COUNT(*) = 3
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name IN ('result_rankings_single', 'result_rankings_average', 'result_ranking_counts')
  ),
  'competitionRankings', (
    SELECT COUNT(*) = 3
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name IN ('competition_podium_members', 'competition_event_stats', 'competition_stats')
  ),
  'cityEventStats', (
    SELECT COUNT(*) = 2
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name IN ('city_event_stats', 'entity_ranking_counts')
  ),
  'sumOfRanks', (
    SELECT COUNT(*) = 1
    FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = 'person_sum_of_ranks_scores'
  ),
  'yearlyPersonRankings', (
    SELECT COUNT(*) = 4
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name IN (
        'person_year_ranking_cohorts', 'person_year_rankings_single',
        'person_year_rankings_average', 'person_year_ranking_counts'
      )
  )
)
WHERE state.capabilities_json IS NULL;

ALTER TABLE ranking_generation_state
  MODIFY capabilities_json LONGTEXT NOT NULL,
  ADD CONSTRAINT chk_ranking_generation_capabilities_json CHECK (JSON_VALID(capabilities_json));
