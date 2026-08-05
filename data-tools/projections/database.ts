import type {
  IndexDefinition,
  ProjectionConnection,
  TableTypeRow,
} from "./database-types.ts";
import type { RowDataPacket } from "mysql2/promise";

export const INDEXES: readonly IndexDefinition[] = [
  ["persons", "idx_persons_wca_sub", "(`wca_id`, `sub_id`)", "wca_id,sub_id"],
  ["persons", "idx_persons_name", "(`name`)", "name"],
  [
    "ranks_single",
    "idx_ranks_single_world",
    "(`event_id`, `world_rank`, `person_id`)",
    "event_id,world_rank,person_id",
  ],
  [
    "ranks_single",
    "idx_ranks_single_continent",
    "(`event_id`, `continent_rank`, `person_id`)",
    "event_id,continent_rank,person_id",
  ],
  [
    "ranks_single",
    "idx_ranks_single_country",
    "(`event_id`, `country_rank`, `person_id`)",
    "event_id,country_rank,person_id",
  ],
  [
    "ranks_average",
    "idx_ranks_average_world",
    "(`event_id`, `world_rank`, `person_id`)",
    "event_id,world_rank,person_id",
  ],
  [
    "ranks_average",
    "idx_ranks_average_continent",
    "(`event_id`, `continent_rank`, `person_id`)",
    "event_id,continent_rank,person_id",
  ],
  [
    "ranks_average",
    "idx_ranks_average_country",
    "(`event_id`, `country_rank`, `person_id`)",
    "event_id,country_rank,person_id",
  ],
  [
    "results",
    "idx_results_single_best",
    "(`person_id`, `event_id`, `best`, `id`)",
    "person_id,event_id,best,id",
  ],
  [
    "results",
    "idx_results_single_event_best",
    "(`event_id`, `best`, `id`)",
    "event_id,best,id",
  ],
  [
    "results",
    "idx_results_average_best",
    "(`person_id`, `event_id`, `average`, `id`)",
    "person_id,event_id,average,id",
  ],
  [
    "result_attempts",
    "idx_result_attempts_result",
    "(`result_id`, `attempt_number`)",
    "result_id,attempt_number",
  ],
  [
    "results",
    "idx_results_average_event_best",
    "(`event_id`, `average`, `id`)",
    "event_id,average,id",
  ],
  [
    "results",
    "idx_results_single_country_best",
    "(`event_id`, `person_country_id`, `best`, `id`)",
    "event_id,person_country_id,best,id",
  ],
  [
    "results",
    "idx_results_average_country_best",
    "(`event_id`, `person_country_id`, `average`, `id`)",
    "event_id,average,id",
  ],
];

export async function ensureIndexes(
  connection: ProjectionConnection,
  indexes: readonly IndexDefinition[] = INDEXES,
): Promise<void> {
  for (const [table, name, columns, columnList] of indexes) {
    if (table === "results" && process.env.WCA_SKIP_LARGE_INDEXES === "1") {
      process.stdout.write(
        `Skipping large results index ${name} in constrained mode\n`,
      );
      continue;
    }
    const [tables] = await connection.query<RowDataPacket[]>(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1",
      [table],
    );
    if (tables.length === 0) {
      process.stdout.write(
        `Skipping ${table} index ${name}; table is not present\n`,
      );
      continue;
    }
    const [existing] = await connection.query<RowDataPacket[]>(
      "SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1",
      [table, name],
    );
    if (existing.length === 0) {
      await connection.query(
        `ALTER TABLE \`${table}\` ADD INDEX \`${name}\` ${columns}`,
      );
      process.stdout.write(`Added ${table}.${name} (${columnList})\n`);
    }
  }
}

export async function ensureWcaPersonLookupIndex(
  connection: ProjectionConnection,
): Promise<void> {
  await ensureIndexes(
    connection,
    INDEXES.filter(
      ([table, name]) => table === "persons" && name === "idx_persons_wca_sub",
    ),
  );
}

export async function dropManagedObject(
  connection: ProjectionConnection,
  name: string,
): Promise<void> {
  const [rows] = await connection.query<TableTypeRow[]>(
    "SELECT TABLE_TYPE AS type FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1",
    [name],
  );
  if (rows[0]?.type === "VIEW") await connection.query(`DROP VIEW \`${name}\``);
  if (rows[0]?.type === "BASE TABLE")
    await connection.query(`DROP TABLE \`${name}\``);
}

export async function tableExists(
  connection: ProjectionConnection,
  name: string,
): Promise<boolean> {
  const [rows] = await connection.query<RowDataPacket[]>(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1",
    [name],
  );
  return rows.length > 0;
}
