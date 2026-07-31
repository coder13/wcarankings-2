export function rankingRegionsQuery(kind: "continent" | "country") {
  const idColumn = kind === "continent" ? "continent_id" : "country_id";
  const nameColumn = kind === "continent" ? "continent_id" : "country_name";
  const isoColumn = kind === "continent" ? "''" : "country_iso2";
  return `SELECT DISTINCT ${idColumn} AS id, ${nameColumn} AS name, ${isoColumn} AS iso2
       FROM ranking_entries
       ORDER BY name`;
}
