CREATE OR REPLACE VIEW wca_best_single AS
SELECT
  person_id,
  event_id,
  CAST(
    SUBSTRING_INDEX(
      GROUP_CONCAT(
        best
        ORDER BY
          best,
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
        best,
        id
    ),
    ',',
    1
  ) AS competition_id
FROM
  results
WHERE
  best > 0
GROUP BY
  person_id,
  event_id;
