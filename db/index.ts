import { createRequire } from "node:module";
import type { Pool, PoolConnection } from "mysql2/promise";

const require = createRequire(import.meta.url);
const { createPool } =
  require("mysql2/promise") as typeof import("mysql2/promise");

const globalForDb = globalThis as typeof globalThis & {
  __cubeRanksPool?: Pool;
  __cubeRanksQueue?: DatabaseQueue;
};

function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export class DatabaseOverloadedError extends Error {
  constructor() {
    super("The database queue is full.");
    this.name = "DatabaseOverloadedError";
  }
}

class DatabaseQueue {
  private active = 0;
  private readonly limit = Math.floor(
    positiveNumber(process.env.DATABASE_QUEUE_LIMIT, 20),
  );

  snapshot() {
    return { active: this.active, limit: this.limit };
  }

  async acquire() {
    if (this.active >= this.limit) throw new DatabaseOverloadedError();
    this.active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
    };
  }
}

function getDatabaseOptions() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");

  const url = new URL(connectionString);
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
    waitForConnections: true,
    connectionLimit: Math.floor(
      positiveNumber(process.env.DATABASE_POOL_MAX, 5),
    ),
    idleTimeout: 30_000,
    enableKeepAlive: true,
    dateStrings: true,
  } as const;
}

export function getPool() {
  if (globalForDb.__cubeRanksPool) return globalForDb.__cubeRanksPool;
  globalForDb.__cubeRanksPool = createPool(getDatabaseOptions());
  return globalForDb.__cubeRanksPool;
}

function getQueue() {
  if (!globalForDb.__cubeRanksQueue)
    globalForDb.__cubeRanksQueue = new DatabaseQueue();
  return globalForDb.__cubeRanksQueue;
}

export function getDatabaseDiagnostics() {
  const queue = getQueue().snapshot();
  const poolLimit = Math.floor(
    positiveNumber(process.env.DATABASE_POOL_MAX, 5),
  );
  return {
    poolLimit,
    queueLimit: queue.limit,
    queueActive: queue.active,
    queueUtilization: queue.limit === 0 ? 0 : queue.active / queue.limit,
    statementTimeoutMs: Math.floor(
      positiveNumber(process.env.DATABASE_STATEMENT_TIMEOUT_MS, 10_000),
    ),
  };
}

async function applyStatementTimeout(connection: PoolConnection) {
  const timeoutSeconds =
    positiveNumber(process.env.DATABASE_STATEMENT_TIMEOUT_MS, 10_000) / 1000;
  await connection.query(`SET SESSION max_statement_time = ${timeoutSeconds}`);
}

interface QueryResult<Row> {
  rowCount: number;
  rows: Row[];
  timings: {
    queueMs: number;
    statementMs: number;
  };
}

export async function query<T extends Record<string, unknown>>(
  text: string,
  values: unknown[] = [],
): Promise<QueryResult<T>> {
  const releaseQueue = await getQueue().acquire();
  const queuedAt = performance.now();
  let connection: Awaited<ReturnType<Pool["getConnection"]>> | undefined;
  try {
    connection = await getPool().getConnection();
    await applyStatementTimeout(connection);
    const queueMs = performance.now() - queuedAt;
    const statementAt = performance.now();
    const [rows] = (await connection.query(text, values)) as [T[], unknown];
    return {
      rows,
      rowCount: rows.length,
      timings: { queueMs, statementMs: performance.now() - statementAt },
    };
  } finally {
    connection?.release();
    releaseQueue();
  }
}

export async function withTransaction<T>(
  callback: (connection: PoolConnection) => Promise<T>,
) {
  const releaseQueue = await getQueue().acquire();
  let connection: PoolConnection | undefined;
  try {
    connection = await getPool().getConnection();
    await applyStatementTimeout(connection);
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch {
        connection.destroy();
        connection = undefined;
      }
    }
    throw error;
  } finally {
    connection?.release();
    releaseQueue();
  }
}
