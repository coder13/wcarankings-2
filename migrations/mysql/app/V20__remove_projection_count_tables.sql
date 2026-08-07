DROP TABLE IF EXISTS ranking_counts,
  result_ranking_counts,
  person_year_ranking_counts,
  person_competition_ranking_counts,
  person_activity_ranking_counts,
  person_medal_ranking_counts,
  person_competition_counts,
  person_competition_year_counts,
  person_activity_counts;

UPDATE ranking_generation_state state
SET capabilities_json = JSON_SET(
  state.capabilities_json,
  '$.core', (SELECT COUNT(*) = 2 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('ranking_entries_single', 'ranking_entries_average')),
  '$.resultRankings', (SELECT COUNT(*) = 2 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('result_rankings_single', 'result_rankings_average')),
  '$.personActivityRankings', (SELECT COUNT(*) = 2 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('person_activity_rankings', 'person_period_metrics')),
  '$.personCompetitionRankings', (SELECT COUNT(*) = 2 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('person_competition_rankings', 'person_period_metrics')),
  '$.personMedalRankings', (SELECT COUNT(*) = 2 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('person_medal_scores', 'person_medal_rankings')),
  '$.yearlyPersonRankings', (SELECT COUNT(*) = 4 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('person_year_ranking_cohorts', 'person_year_rankings_single', 'person_year_rankings_average', 'person_event_bests'))
)
WHERE state.id = 1;
