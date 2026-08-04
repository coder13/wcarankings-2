export function checkServerDatasetCompatibility({
  server,
  datasetSchemaVersion,
}: {
  server?: {
    minimumDatasetSchemaVersion?: number;
    maximumDatasetSchemaVersion?: number;
  };
  datasetSchemaVersion: number | string;
}) {
  const version = Number(datasetSchemaVersion);
  const minimum = Number(server?.minimumDatasetSchemaVersion);
  const maximum = Number(server?.maximumDatasetSchemaVersion);
  if (![version, minimum, maximum].every(Number.isInteger)) {
    throw new Error("Compatibility versions must be integers");
  }
  if (version < minimum || version > maximum) {
    throw new Error(
      `Dataset schema version ${version} is outside the server's supported range ${minimum}-${maximum}`,
    );
  }
  return { compatible: true, datasetSchemaVersion: version, minimum, maximum };
}
