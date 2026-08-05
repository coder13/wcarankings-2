export interface DatabaseOptions {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface DatabaseOptionsInput {
  databaseName?: string;
}

export function databaseOptions(
  connectionString = process.env.DATABASE_URL,
  { databaseName }: DatabaseOptionsInput = {},
): DatabaseOptions {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const url = new URL(connectionString);
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database:
      databaseName || decodeURIComponent(url.pathname.replace(/^\//, "")),
  };
}
