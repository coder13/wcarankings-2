-- Some development databases applied an earlier V17 migration that created
-- person gender-position indexes. V17 was later reused for this cleanup, so
-- run the cleanup again under a new version. The statements are idempotent
-- for databases that already applied the later V17 migration.
DROP TABLE IF EXISTS result_gender_ranking_counts,
result_gender_rankings_single,
result_gender_rankings_average;
