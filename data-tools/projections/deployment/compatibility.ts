import type {
  CheckServerDatasetCompatibilityInput,
  DatasetCompatibilityResult,
} from "./types.ts";

export function checkServerDatasetCompatibility(
  input: CheckServerDatasetCompatibilityInput,
): DatasetCompatibilityResult {
  const version = Number(input.datasetSchemaVersion);
  const minimum = Number(input.server?.minimumDatasetSchemaVersion);
  const maximum = Number(input.server?.maximumDatasetSchemaVersion);
  if (![version, minimum, maximum].every(Number.isInteger)) {
    throw new Error("Compatibility versions must be integers");
  }
  if (version < minimum || version > maximum) {
    throw new Error(
      `Dataset schema version ${version} is outside the server's supported range ${minimum}-${maximum}`,
    );
  }
  return {
    compatible: true,
    datasetSchemaVersion: version,
    minimum,
    maximum,
  };
}
