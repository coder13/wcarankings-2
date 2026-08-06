const EXPORT_API = "https://www.worldcubeassociation.org/api/v0/export/public";

export async function resolveWcaExport(fetchImpl = fetch) {
  const response = await fetchImpl(EXPORT_API, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok)
    throw new Error(`WCA export API returned ${response.status}.`);

  const payload = await response.json();
  const exportDate = payload.export_date ?? payload.exportDate;
  const sqlUrl = payload.sql_url ?? payload.sqlUrl;
  const version =
    payload.export_format_version ?? payload.exportFormatVersion ?? "2";
  if (!exportDate || !sqlUrl) {
    throw new Error(
      "The WCA export API response is missing export_date or sql_url.",
    );
  }
  if (!String(version).startsWith("2")) {
    throw new Error(
      `Unsupported WCA export major version: ${version}. Review the importer before continuing.`,
    );
  }
  return {
    exportDate: String(exportDate),
    sqlUrl: String(sqlUrl),
    version: String(version),
  };
}
