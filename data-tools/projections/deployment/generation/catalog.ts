import {
  DEPLOYMENT_PROJECTION_GROUPS,
  PROJECTION_CAPABILITIES,
} from "../../../projection-catalog/groups.ts";
import type { GenerationManifest } from "./types.ts";

const WCA_RAW_TABLES = [
  "persons",
  "competitions",
  "events",
  "results",
  "result_attempts",
  "ranks_single",
  "ranks_average",
  "round_types",
  "formats",
  "countries",
  "continents",
  "scrambles",
  "championships",
  "eligible_country_iso2s_for_championship",
] as const;

function groupTables(groups: readonly string[]): string[] {
  const selected = new Set(groups);
  const definitions = DEPLOYMENT_PROJECTION_GROUPS.filter((group) =>
    selected.has(group.name),
  );
  if (definitions.length !== selected.size) {
    throw new Error("The release contains an unknown projection group");
  }
  return [...new Set(definitions.flatMap((group) => group.tables))];
}

export function capabilitiesFromTables(
  tables: Iterable<string>,
): Record<string, boolean> {
  const present = new Set(tables);
  const groups = new Map(
    DEPLOYMENT_PROJECTION_GROUPS.map((group) => [
      group.name,
      group.tables.every((table) => present.has(table)),
    ]),
  );
  return Object.fromEntries(
    Object.entries(PROJECTION_CAPABILITIES).map(
      ([capability, requiredGroups]) => [
        capability,
        requiredGroups.every((group) => groups.get(group) === true),
      ],
    ),
  );
}

export function activationTables(manifest: GenerationManifest): string[] {
  const groups = Object.keys(manifest.groups);
  if (groups.length === 0) {
    throw new Error("The release contains no projection groups");
  }
  if (manifest.raw && groups.length !== DEPLOYMENT_PROJECTION_GROUPS.length) {
    throw new Error(
      "A raw WCA export can only activate with every projection group",
    );
  }
  return [
    ...(manifest.raw ? [...WCA_RAW_TABLES, "export_metadata"] : []),
    ...groupTables(groups),
    "ranking_generation_state",
  ];
}
