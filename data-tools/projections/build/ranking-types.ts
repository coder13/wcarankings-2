import type { ProjectionConnection } from "../shared/database-types.ts";
import type { TableProgress } from "./progress-types.ts";

interface RankingTablePair {
  average: string;
  single: string;
}

export interface RankingSourceNames {
  bestAverage: string;
  bestSingle: string;
  entriesSources: RankingTablePair;
  projectionSuffix?: string;
  resultFacts: string;
}

export type RankingTableTaskName =
  | "ranking-tables-entries-single-source"
  | "ranking-tables-entries-average-source"
  | "ranking-tables-entries-single"
  | "ranking-tables-entries-average";

export interface RankingTableTaskDefinition {
  dependencies: readonly string[];
  estimatedDurationMs: number;
  name: RankingTableTaskName;
  table?: string;
}

export interface RankingTableTask extends RankingTableTaskDefinition {
  run(connection: ProjectionConnection): Promise<unknown>;
}

export interface RankingTableTaskOptions {
  bestAverage: string;
  bestSingle: string;
  entriesSources: RankingTablePair;
  entriesTables: RankingTablePair;
  resultFacts: string;
  tableProgress: TableProgress;
}

export type RankingTableTaskRunner = (
  connection: ProjectionConnection,
) => Promise<unknown>;
