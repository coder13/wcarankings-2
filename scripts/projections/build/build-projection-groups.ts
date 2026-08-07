import mysql from "mysql2/promise";
import { argumentList, argumentValue } from "../../lib/arguments.ts";
import { databaseOptions } from "../../lib/database.ts";
import { buildProjectionTables } from "../../../data-tools/projections/build/builder.ts";
import { formatProjectionBuildSummary } from "../../../data-tools/projections/build/plan.ts";
import { DEPLOYMENT_PROJECTION_GROUPS } from "../../../data-tools/projection-catalog/groups.ts";
import { PROJECTION_JOBS } from "../../../data-tools/projection-catalog/registry.ts";

async function main(): Promise<void> {
  const projectionNames = argumentList("projection-names");
  const satisfiedProjectionNames = argumentList("satisfied-projection-names");
  const requestedGroups = argumentList("groups");
  const requestedSatisfiedGroups = argumentList("satisfied-groups");
  const includeRankingTablesValue = argumentValue("include-ranking-tables");
  const useDefaultBuild =
    projectionNames.length === 0 && includeRankingTablesValue === "";
  const includeRankingTables =
    useDefaultBuild || includeRankingTablesValue === "true";
  const selectedProjectionNames = useDefaultBuild ? undefined : projectionNames;
  let groupNames: string[];
  if (requestedGroups.length > 0) {
    groupNames = requestedGroups;
  } else if (useDefaultBuild) {
    groupNames = PROJECTION_JOBS.filter(
      (job) => job.kind === "core" || job.enabledByDefault,
    ).map((job) => job.releaseGroup);
  } else {
    groupNames = DEPLOYMENT_PROJECTION_GROUPS.filter(
      (group) =>
        group.projectionNames.some((name) => projectionNames.includes(name)) ||
        (group.name === "ranking-tables" && includeRankingTables),
    ).map((group) => group.name);
  }
  let satisfiedGroups: string[];
  if (requestedSatisfiedGroups.length > 0) {
    satisfiedGroups = requestedSatisfiedGroups;
  } else {
    satisfiedGroups = DEPLOYMENT_PROJECTION_GROUPS.filter((group) =>
      group.projectionNames.some((name) =>
        satisfiedProjectionNames.includes(name),
      ),
    ).map((group) => group.name);
  }

  process.stdout.write(
    formatProjectionBuildSummary(groupNames, satisfiedGroups),
  );

  const options = databaseOptions();
  const connection = await mysql.createConnection(options);
  try {
    await buildProjectionTables(connection, {
      projectionNames: selectedProjectionNames,
      satisfiedProjectionNames,
      includeRankingTables,
      createConnection: () => mysql.createConnection(options),
    });
  } finally {
    await connection.end();
  }
}

if (import.meta.main) await main();
