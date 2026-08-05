export function rankingRegionsQuery(kind: "continent" | "country") {
  const idColumn = escapeSqlIdentifier(
    kind === "continent" ? "continent_id" : "country_id",
  );
  const nameColumn = escapeSqlIdentifier(
    kind === "continent" ? "continent_id" : "country_name",
  );
  const isoColumn =
    kind === "continent" ? "''" : escapeSqlIdentifier("country_iso2");
  return sqlFragment`
    SELECT DISTINCT
      ${idColumn} AS id,
      ${nameColumn} AS name,
      ${isoColumn} AS iso2
    FROM
      ranking_entries
    ORDER BY
      name
  `;
}
import { escapeSqlIdentifier, sqlFragment } from "@/lib/helpers/database/sql";
