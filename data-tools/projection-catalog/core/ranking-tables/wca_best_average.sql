CREATE OR REPLACE VIEW wca_best_average AS
SELECT
  person_id,
  event_id,
  CAST(
    SUBSTRING_INDEX(
      GROUP_CONCAT(
        average
        ORDER BY
          average,
          id
      ),
      ',',
      1
    ) AS UNSIGNED
  ) AS best,
  SUBSTRING_INDEX(
    GROUP_CONCAT(
      competition_id
      ORDER BY
        average,
        id
    ),
    ',',
    1
  ) AS competition_id
FROM
  results
WHERE
  average > 0
GROUP BY
  person_id,
  event_id;
