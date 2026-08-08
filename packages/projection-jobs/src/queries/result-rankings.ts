import SQL, { raw } from "sql-template-tag";

export type ResultRankingScope = "world" | "continent" | "country";
export type ResultRankingGender = "all" | "m" | "f" | "o";
export type ResultRankingType = "single" | "average";

export type ResultRankingInput = {
  eventId: string;
  gender: ResultRankingGender;
  periodYear: number;
  regionId?: string;
  resultType: ResultRankingType;
  scope: ResultRankingScope;
};

const tableFor = (resultType: ResultRankingType) =>
  resultType === "single"
    ? "result_rankings_single"
    : "result_rankings_average";

const scopeColumnFor = (scope: ResultRankingScope) =>
  scope === "world" ? undefined : `${scope}_id`;

const rankColumnFor = ({
  gender,
  scope,
}: Pick<ResultRankingInput, "gender" | "scope">) =>
  gender === "all" ? `${scope}_rank` : `gender_${scope}_rank`;

const positionColumnFor = ({
  gender,
  scope,
}: Pick<ResultRankingInput, "gender" | "scope">) =>
  gender === "all" ? `${scope}_position` : `gender_${scope}_position`;

const rankingColumns = [
  "world_rank",
  "world_position",
  "continent_rank",
  "continent_position",
  "country_rank",
  "country_position",
] as const;

const liveRowsFor = ({
  eventId,
  periodYear,
  resultType,
}: ResultRankingInput) =>
  resultType === "single"
    ? SQL`
        SELECT
          -CAST(live.projection_result_id AS SIGNED) AS result_id,
          attempts.attempt_number,
          CAST(live.event_id AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS event_id,
          CAST(live.person_id AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS person_id,
          CAST(CASE WHEN person.gender IN ('m', 'f') THEN person.gender ELSE 'o' END AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS gender,
          CAST(live.competition_id AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS competition_id,
          STR_TO_DATE(
            CONCAT(
              competition.year,
              '-',
              LPAD(competition.month, 2, '0'),
              '-',
              LPAD(competition.day, 2, '0')
            ),
            '%Y-%m-%d'
          ) AS competition_start_date,
          CAST(country.id AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS country_id,
          CAST(country.continent_id AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS continent_id,
          attempts.result_value,
          CAST('' AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS record_code
        FROM provisional_live_results live
        INNER JOIN provisional_live_result_sources source
          ON source.source_name = live.source_name
          AND source.competition_id = live.competition_id
          AND source.enabled = 1
        INNER JOIN competitions competition ON competition.id = live.competition_id
        INNER JOIN countries country ON country.iso2 = live.country_iso2
        LEFT JOIN persons person
          ON person.wca_id = live.person_id
          AND person.sub_id = 1
        INNER JOIN JSON_TABLE(
          live.attempts_json,
          '$[*]' COLUMNS (
            attempt_number FOR ORDINALITY,
            result_value INT PATH '$'
          )
        ) attempts ON TRUE
        WHERE live.event_id = ${eventId}
          AND (${periodYear} = 0 OR competition.year = ${periodYear})
          AND attempts.result_value > 0
      `
    : SQL`
        SELECT
          -CAST(live.projection_result_id AS SIGNED) AS result_id,
          NULL AS attempt_number,
          CAST(live.event_id AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS event_id,
          CAST(live.person_id AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS person_id,
          CAST(CASE WHEN person.gender IN ('m', 'f') THEN person.gender ELSE 'o' END AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS gender,
          CAST(live.competition_id AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS competition_id,
          STR_TO_DATE(
            CONCAT(
              competition.year,
              '-',
              LPAD(competition.month, 2, '0'),
              '-',
              LPAD(competition.day, 2, '0')
            ),
            '%Y-%m-%d'
          ) AS competition_start_date,
          CAST(country.id AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS country_id,
          CAST(country.continent_id AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS continent_id,
          live.average AS result_value,
          CAST('' AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS record_code
        FROM provisional_live_results live
        INNER JOIN provisional_live_result_sources source
          ON source.source_name = live.source_name
          AND source.competition_id = live.competition_id
          AND source.enabled = 1
        INNER JOIN competitions competition ON competition.id = live.competition_id
        INNER JOIN countries country ON country.iso2 = live.country_iso2
        LEFT JOIN persons person
          ON person.wca_id = live.person_id
          AND person.sub_id = 1
        WHERE live.event_id = ${eventId}
          AND (${periodYear} = 0 OR competition.year = ${periodYear})
          AND live.average > 0
      `;

export const deleteStaleProvisionalResultRowsQuery = ({
  eventId,
  periodYear,
  resultType,
}: Pick<ResultRankingInput, "eventId" | "periodYear" | "resultType">) => {
  const table = raw(tableFor(resultType));
  return SQL`
    DELETE ranking
    FROM ${table} ranking
    WHERE ranking.event_id = ${eventId}
      AND ranking.period_year = ${periodYear}
      AND ranking.result_id < 0
      AND NOT EXISTS (
        SELECT 1
        FROM (${liveRowsFor({
          eventId,
          gender: "all",
          periodYear,
          resultType,
          scope: "world",
        })}) live
        WHERE live.result_id = ranking.result_id
          AND (live.attempt_number <=> ranking.attempt_number)
      )
  `;
};

export const upsertProvisionalResultRankingSliceQuery = (
  input: ResultRankingInput,
) => {
  const table = raw(tableFor(input.resultType));
  const rankColumn = raw(rankColumnFor(input));
  const positionColumn = raw(positionColumnFor(input));
  const rankColumnName = rankColumnFor(input);
  const positionColumnName = positionColumnFor(input);
  const rankingValues = raw(
    rankingColumns
      .map((column) =>
        column === rankColumnName || column === positionColumnName
          ? column.endsWith("rank")
            ? "ranked.ranking_rank"
            : "ranked.ranking_position"
          : "0",
      )
      .join(",\n      "),
  );
  const scopeColumn = scopeColumnFor(input.scope);
  const scopeCondition = scopeColumn
    ? SQL`AND candidate.${raw(scopeColumn)} = ${input.regionId}`
    : SQL``;
  const genderCondition =
    input.gender === "all"
      ? SQL``
      : SQL`AND candidate.gender = ${input.gender}`;
  const live = liveRowsFor(input);

  return SQL`
    INSERT INTO ${table} (
      period_year, result_id, attempt_number, event_id, person_id, gender,
      competition_id, ${
        input.resultType === "single" ? raw("competition_start_date,") : raw("")
      }
      country_id, continent_id, result_value, record_code,
      world_rank, world_position, continent_rank, continent_position,
      country_rank, country_position, is_provisional
    )
    WITH candidates AS (
      SELECT
        ranking.result_id,
        ranking.attempt_number,
        ranking.event_id,
        ranking.person_id,
        ranking.gender,
        ranking.competition_id,
        ${
          input.resultType === "single"
            ? raw("ranking.competition_start_date,")
            : raw(
                "STR_TO_DATE(CONCAT(competition.year, '-', LPAD(competition.month, 2, '0'), '-', LPAD(competition.day, 2, '0')), '%Y-%m-%d') AS competition_start_date,",
              )
        }
        ranking.country_id,
        ranking.continent_id,
        ranking.result_value,
        ranking.record_code
      FROM ${table} ranking
      INNER JOIN competitions competition ON competition.id = ranking.competition_id
      WHERE ranking.period_year = 0
        AND ranking.event_id = ${input.eventId}
        AND ranking.result_id > 0
        AND (${input.periodYear} = 0 OR competition.year = ${input.periodYear})
      UNION ALL
      ${live}
    ), scoped AS (
      SELECT candidate.*
      FROM candidates candidate
      WHERE TRUE ${scopeCondition} ${genderCondition}
    ), ranked AS (
      SELECT
        scoped.*,
        RANK() OVER (ORDER BY scoped.result_value) AS ranking_rank,
        ROW_NUMBER() OVER (
          ORDER BY scoped.result_value, scoped.competition_start_date,
            scoped.competition_id, scoped.result_id, scoped.attempt_number
        ) AS ranking_position
      FROM scoped
    )
    SELECT
      ${input.periodYear},
      ranked.result_id,
      ranked.attempt_number,
      ranked.event_id,
      ranked.person_id,
      ranked.gender,
      ranked.competition_id,
      ${input.resultType === "single" ? raw("ranked.competition_start_date,") : raw("")}
      ranked.country_id,
      ranked.continent_id,
      ranked.result_value,
      ranked.record_code,
      ${rankingValues},
      1
    FROM ranked
    ON DUPLICATE KEY UPDATE
      person_id = VALUES(person_id),
      gender = VALUES(gender),
      competition_id = VALUES(competition_id),
      ${
        input.resultType === "single"
          ? raw("competition_start_date = VALUES(competition_start_date),")
          : raw("")
      }
      country_id = VALUES(country_id),
      continent_id = VALUES(continent_id),
      result_value = VALUES(result_value),
      record_code = VALUES(record_code),
      ${rankColumn} = VALUES(${rankColumn}),
      ${positionColumn} = VALUES(${positionColumn}),
      is_provisional = VALUES(is_provisional)
  `;
};
