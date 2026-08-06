import { resolveWcaExport } from "./lib/wca-export.ts";

const { exportDate, sqlUrl, version } = await resolveWcaExport();

process.stdout.write(
  `${JSON.stringify({
    exportDate,
    date: exportDate.slice(0, 10),
    version: version.replace(/^v/i, ""),
    sqlUrl,
  })}\n`,
);
