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

export interface WorkerHeartbeatConnection {
  query(sql: string, values: unknown[]): Promise<unknown>;
}

export async function recordWorkerHeartbeat(
  connection: WorkerHeartbeatConnection,
  {
    workerName,
    timeoutSeconds,
    details = {},
  }: {
    workerName: string;
    timeoutSeconds: number;
    details?: Record<string, string | number | boolean | null>;
  },
): Promise<void> {
  await connection.query(
    `INSERT INTO worker_runtime_status
       (worker_name, process_id, started_at, heartbeat_at, heartbeat_timeout_seconds, details_json)
     VALUES (?, ?, CURRENT_TIMESTAMP(6), CURRENT_TIMESTAMP(6), ?, ?)
     ON DUPLICATE KEY UPDATE
       process_id = VALUES(process_id),
       heartbeat_at = VALUES(heartbeat_at),
       heartbeat_timeout_seconds = VALUES(heartbeat_timeout_seconds),
       details_json = VALUES(details_json)`,
    [workerName, process.pid, timeoutSeconds, JSON.stringify(details)],
  );
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
