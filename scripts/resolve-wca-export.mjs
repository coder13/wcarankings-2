const EXPORT_API = "https://www.worldcubeassociation.org/api/v0/export/public";

const response = await fetch(EXPORT_API, { headers: { Accept: "application/json" } });
if (!response.ok) throw new Error(`WCA export API returned ${response.status}.`);

const payload = await response.json();
const exportDate = payload.export_date ?? payload.exportDate;
const sqlUrl = payload.sql_url ?? payload.sqlUrl;
const version = payload.export_format_version ?? payload.exportFormatVersion ?? "2";

if (!exportDate || !sqlUrl) throw new Error("The WCA export API response is missing export_date or sql_url.");
if (!String(version).startsWith("2")) {
  throw new Error(`Unsupported WCA export major version: ${version}. Review the importer before continuing.`);
}

process.stdout.write(`${JSON.stringify({
  exportDate: String(exportDate),
  date: String(exportDate).slice(0, 10),
  version: String(version).replace(/^v/i, ""),
  sqlUrl: String(sqlUrl),
})}\n`);
