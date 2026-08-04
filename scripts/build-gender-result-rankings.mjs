import mysql from "mysql2/promise";
import { databaseOptions } from "./lib/database.mjs";

const connection = await mysql.createConnection(databaseOptions());
const tables = [
  ["worktree_gender_result_rankings_single", "result_rankings_single"],
  ["worktree_gender_result_rankings_average", "result_rankings_average"],
];

try {
  for (const [target, source] of tables) {
    const [existing] = await connection.query(
      "SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
      [target],
    );
    if (existing[0].count) continue;
    await connection.query(`
      CREATE TABLE \`${target}\` AS
      SELECT ranking.result_id, ranking.event_id, ranking.person_id,
        ranking.competition_id, ranking.result_value, ranking.country_id,
        ranking.continent_id, ranking.record_code,
        ranking.world_rank, ranking.world_position,
        ranking.continent_rank, ranking.continent_position,
        ranking.country_rank, ranking.country_position,
        person.gender AS person_gender
      FROM \`${source}\` ranking
      LEFT JOIN persons person
        ON person.wca_id = ranking.person_id AND person.sub_id = 1
    `);
    await connection.query(`
      ALTER TABLE \`${target}\`
        ADD PRIMARY KEY (result_id),
        ADD INDEX idx_gender_result_event (event_id, person_gender, result_value, result_id),
        ADD INDEX idx_gender_result_continent (event_id, continent_id, person_gender, result_value, result_id),
        ADD INDEX idx_gender_result_country (event_id, country_id, person_gender, result_value, result_id)
    `);
  }
  process.stdout.write(JSON.stringify({ tables: tables.map(([target]) => target) }) + "\n");
} finally {
  await connection.end();
}
