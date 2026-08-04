export function databaseOptions(
  connectionString = process.env.DATABASE_URL,
  { databaseOverride, multipleStatements = false } = {},
) {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const url = new URL(connectionString);
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: databaseOverride
      || process.env.DATABASE_NAME_OVERRIDE
      || decodeURIComponent(url.pathname.replace(/^\//, "")),
    ...(multipleStatements ? { multipleStatements: true } : {}),
  };
}
