import type { PersonIdSearchInput, PersonSearchDatabaseInput } from "@/services/people/types";
import { sqlFragment } from "@/lib/helpers/database/sql";

export function personSearchRowsQuery(input: PersonSearchDatabaseInput) {
  const nameCondition = input.regexSearch
    ? "person.name REGEXP ?"
    : "person.name LIKE ? ESCAPE '\\\\'";
  return sqlFragment`SELECT person.wca_id, person.name, person.country_id, user.avatar_url,
       COUNT(*) OVER() AS total_count,
       COALESCE(competition_counts.competition_count, 0) AS competition_count,
       COALESCE(country.name, person.country_id) AS country_name,
       COALESCE(country.iso2, '') AS country_iso2
     FROM persons person
     LEFT JOIN countries country ON country.id = person.country_id
     LEFT JOIN app_users user ON user.wca_id = person.wca_id
     LEFT JOIN (SELECT person_id, COUNT(DISTINCT competition_id) AS competition_count FROM results GROUP BY person_id) competition_counts ON competition_counts.person_id = person.wca_id
     WHERE person.sub_id = 1
       AND (person.wca_id LIKE ? ESCAPE '\\\\' OR ${nameCondition})
     ORDER BY (person.wca_id = ?) DESC, person.name, person.wca_id
     LIMIT ?, ?`;
}

export function personIdsQuery(input: PersonIdSearchInput) {
  const nameCondition = input.regexSearch ? "name REGEXP ?" : "name LIKE ? ESCAPE '\\\\'";
  return sqlFragment`SELECT wca_id FROM persons
     WHERE sub_id = 1
       AND (wca_id = ? OR ${nameCondition})
     ORDER BY (wca_id = ?) DESC, name, wca_id
     LIMIT ?`;
}
