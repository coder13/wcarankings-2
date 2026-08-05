import { query } from "@/db";

export type PersonProfileHeader = {
  person: {
    id: string;
    name: string;
    countryName: string;
    countryIso2: string;
    continentName: string;
    avatarUrl: string | null;
  };
  competitionCount: number;
  countryCount: number;
  solveCount: number;
  kinchScore: number | null;
};

type PersonProfileHeaderRow = {
  wca_id: string;
  name: string;
  country_name: string;
  country_iso2: string;
  continent_name: string;
  avatar_url: string | null;
  competition_count: number;
  country_count: number;
  solve_count: number;
  kinch_score: number | null;
};

const WCA_ID_PATTERN = /^\d{4}[A-Z]{4}\d{2}$/;

export function normalizeProfileWcaId(value: string) {
  const wcaId = value.trim().toUpperCase();
  return WCA_ID_PATTERN.test(wcaId) ? wcaId : null;
}

export async function loadPersonProfileHeader(
  wcaId: string,
): Promise<PersonProfileHeader | null> {
  const normalized = normalizeProfileWcaId(wcaId);
  if (!normalized) return null;

  const result = await query<PersonProfileHeaderRow>(
    `SELECT person.wca_id, COALESCE(person.name, person.wca_id) AS name,
       COALESCE(country.name, country.id, '') AS country_name,
       COALESCE(country.iso2, '') AS country_iso2,
       COALESCE(continent.name, country.continent_id, '') AS continent_name,
       app_user.avatar_url,
       COALESCE(competition_counts.competition_count, 0) AS competition_count,
       COALESCE(profile_stats.country_count, 0) AS country_count,
       COALESCE(solves.solve_count, 0) AS solve_count,
       kinch.kinch_score / 17.0 AS kinch_score
     FROM persons person
     LEFT JOIN countries country ON country.id = person.country_id
     LEFT JOIN continents continent ON continent.id = country.continent_id
     LEFT JOIN app_users app_user ON app_user.wca_id = person.wca_id
     LEFT JOIN person_competition_counts competition_counts
       ON competition_counts.person_id = person.wca_id
     LEFT JOIN person_sum_of_ranks_scores kinch
       ON kinch.metric_version = 1
       AND kinch.event_set_version = 1
       AND kinch.result_type = 'single'
       AND kinch.scope = 'world'
       AND kinch.region_id = ''
       AND kinch.person_id = person.wca_id
     LEFT JOIN (
       SELECT
         facts.person_id,
         COUNT(DISTINCT competition.country_id) AS country_count
       FROM result_facts facts
       LEFT JOIN competitions competition ON competition.id = facts.competition_id
       WHERE facts.person_id = ?
       GROUP BY facts.person_id
     ) profile_stats ON profile_stats.person_id = person.wca_id
     LEFT JOIN (
       SELECT facts.person_id, COUNT(*) AS solve_count
       FROM result_facts facts
       INNER JOIN result_attempts attempts ON attempts.result_id = facts.result_id
       WHERE facts.person_id = ? AND attempts.value > 0
       GROUP BY facts.person_id
     ) solves ON solves.person_id = person.wca_id
     WHERE person.wca_id = ? AND person.sub_id = 1
     LIMIT 1`,
    [normalized, normalized, normalized],
  );
  const person = result.rows[0];
  if (!person) return null;

  return {
    person: {
      id: person.wca_id,
      name: person.name,
      countryName: person.country_name,
      countryIso2: person.country_iso2,
      continentName: person.continent_name,
      avatarUrl: person.avatar_url,
    },
    competitionCount: Number(person.competition_count),
    countryCount: Number(person.country_count),
    solveCount: Number(person.solve_count),
    kinchScore: person.kinch_score === null ? null : Number(person.kinch_score),
  };
}
