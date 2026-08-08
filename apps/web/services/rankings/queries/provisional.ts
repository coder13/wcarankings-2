import { sqlFragment } from "@/lib/helpers/database/sql";

export function activeProvisionalPersonEventQuery() {
  return sqlFragment`
    SELECT EXISTS(
      SELECT 1
      FROM provisional_live_results live
      INNER JOIN provisional_live_result_sources source
        ON source.source_name = live.source_name
        AND source.competition_id = live.competition_id
        AND source.enabled = 1
      WHERE live.event_id = ?
        AND (live.best > 0 OR live.average > 0)
      LIMIT 1
    ) AS active
  `;
}
