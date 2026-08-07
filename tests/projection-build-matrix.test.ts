import assert from "node:assert/strict";
import test from "node:test";

import { DEPLOYMENT_PROJECTION_GROUPS } from "../data-tools/projection-catalog/groups.ts";
import { createProjectionBuildMatrix } from "../data-tools/projections/build/matrix.ts";

test("the complete production projection graph fits in the supported build waves", () => {
  const selectedGroups = DEPLOYMENT_PROJECTION_GROUPS.map(
    (group) => group.name,
  );
  const waveOne = createProjectionBuildMatrix({ selectedGroups, wave: 1 });
  const waveTwo = createProjectionBuildMatrix({ selectedGroups, wave: 2 });
  const scheduledGroups = [...waveOne.include, ...waveTwo.include].map(
    (entry) => entry.group,
  );

  assert.deepEqual(new Set(scheduledGroups), new Set(selectedGroups));
  assert.equal(scheduledGroups.length, selectedGroups.length);
  assert.deepEqual(
    waveTwo.include.find((entry) => entry.group === "person-activity-rankings"),
    {
      group: "person-activity-rankings",
      hydrate_groups: "result-facts",
    },
  );
});
