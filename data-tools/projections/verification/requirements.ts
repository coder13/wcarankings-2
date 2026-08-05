import { PUBLISHED_PROJECTION_TABLES } from "../../projection-catalog/tables.ts";
import type { ProjectionTableRequirement } from "./types.ts";

const ENTRY_COLUMNS = [
  "event_id",
  "world_rank",
  "world_sub_rank",
  "continent_id",
  "continent_rank",
  "continent_sub_rank",
  "country_id",
  "gender",
  "country_rank",
  "country_sub_rank",
] as const;

const ENTRY_INDEXES = [
  "idx_ranking_entries_world",
  "idx_ranking_entries_continent",
  "idx_ranking_entries_country",
] as const;

const RESULT_RANKING_COLUMNS = [
  "result_id",
  "event_id",
  "result_value",
  "gender",
  "world_rank",
  "world_position",
  "continent_rank",
  "continent_position",
  "country_rank",
  "country_position",
] as const;

const RESULT_RANKING_INDEXES = [
  "PRIMARY",
  "idx_results_single_world",
  "idx_results_single_continent",
  "idx_results_single_country",
  "idx_results_single_person",
  "idx_results_single_lazy_gender",
] as const;

const RESULT_AVERAGE_INDEXES = [
  "PRIMARY",
  "idx_results_average_world",
  "idx_results_average_continent",
  "idx_results_average_country",
  "idx_results_average_person",
] as const;

const SUM_OF_RANKS_COLUMNS = [
  "metric_version",
  "event_set_version",
  "result_type",
  "scope",
  "region_id",
  "person_id",
  "gender",
  "score",
  "coverage",
  "required_coverage",
  "rank",
  "position",
  "kinch_score",
  "kinch_coverage",
  "kinch_rank",
  "kinch_position",
] as const;

const SUM_OF_RANKS_INDEXES = [
  "PRIMARY",
  "idx_person_sum_of_ranks_page",
  "idx_person_kinch_page",
  "idx_person_kinch_continent_page",
  "idx_person_metric_gender_values",
] as const;

const COMPETITION_EVENT_COLUMNS = [
  "competition_id",
  "event_id",
  "fastest_single",
  "fastest_single_result_id",
  "fastest_single_rank",
  "fastest_single_position",
  "fastest_average",
  "fastest_average_result_id",
  "fastest_average_rank",
  "fastest_average_position",
  "podium_score",
  "podium_rank",
  "podium_position",
] as const;

const COMPETITION_EVENT_INDEXES = [
  "PRIMARY",
  "idx_competition_event_fastest_single",
  "idx_competition_event_fastest_average",
  "idx_competition_event_podium",
] as const;

const COMPETITION_PODIUM_COLUMNS = [
  "competition_id",
  "event_id",
  "result_type",
  "podium_position",
  "person_id",
  "result_id",
  "result_value",
] as const;

const COMPETITION_PODIUM_INDEXES = [
  "PRIMARY",
  "idx_comp_podium_members_person",
] as const;

const DETAILED_REQUIREMENTS: readonly ProjectionTableRequirement[] = [
  {
    table: "ranking_entries_single",
    columns: ENTRY_COLUMNS,
    indexes: ENTRY_INDEXES,
  },
  {
    table: "ranking_entries_average",
    columns: ENTRY_COLUMNS,
    indexes: ENTRY_INDEXES,
  },
  {
    table: "result_rankings_single",
    columns: RESULT_RANKING_COLUMNS,
    indexes: RESULT_RANKING_INDEXES,
  },
  {
    table: "result_rankings_average",
    columns: RESULT_RANKING_COLUMNS,
    indexes: RESULT_AVERAGE_INDEXES,
  },
  {
    table: "person_sum_of_ranks_scores",
    columns: SUM_OF_RANKS_COLUMNS,
    indexes: SUM_OF_RANKS_INDEXES,
  },
  {
    table: "competition_event_stats",
    columns: COMPETITION_EVENT_COLUMNS,
    indexes: COMPETITION_EVENT_INDEXES,
  },
  {
    table: "competition_podium_members",
    columns: COMPETITION_PODIUM_COLUMNS,
    indexes: COMPETITION_PODIUM_INDEXES,
  },
];

const detailedTables = new Set(
  DETAILED_REQUIREMENTS.map((requirement) => requirement.table),
);

export const PROJECTION_TABLE_REQUIREMENTS: readonly ProjectionTableRequirement[] =
  [
    ...DETAILED_REQUIREMENTS,
    ...PUBLISHED_PROJECTION_TABLES.filter(
      (table) => !detailedTables.has(table),
    ).map((table) => ({ table })),
    { table: "export_metadata" },
  ];
