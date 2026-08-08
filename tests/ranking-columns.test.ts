import assert from "node:assert/strict";
import test from "node:test";
import { rankingColumns } from "../services/rankings/helpers";

test("uses the result-ranking identifier collation for record comparisons", () => {
  const columns = rankingColumns(
    "world_rank",
    "world_sub_rank",
    "result_rankings_single",
  );

  assert.match(
    columns,
    /current_record\.event_id = ranking\.event_id COLLATE utf8mb4_unicode_ci/,
  );
  assert.match(
    columns,
    /current_record\.continent_id = ranking\.continent_id COLLATE utf8mb4_unicode_ci/,
  );
  assert.match(
    columns,
    /current_record\.country_id = ranking\.country_id COLLATE utf8mb4_unicode_ci/,
  );
});
