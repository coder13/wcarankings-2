import { connect as connectTls, type TLSSocket } from "node:tls";
import { createConnection, type Socket } from "node:net";

export interface ProjectionJobQueueCounts {
  waiting: number;
  active: number;
  delayed: number;
  prioritized: number;
  failed: number;
}

const queueName = "wcarankings-projection-jobs";

function command(...parts: string[]) {
  return `*${parts.length}\r\n${parts
    .map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`)
    .join("")}`;
}

function waitForConnection(socket: Socket | TLSSocket, event: string) {
  return new Promise<void>((resolve, reject) => {
    socket.once(event, resolve);
    socket.once("error", reject);
  });
}

class RedisMonitorConnection {
  private buffer = "";
  private readonly pending: Array<{
    resolve: (value: number | string) => void;
    reject: (reason: Error) => void;
  }> = [];

  constructor(private readonly socket: Socket | TLSSocket) {
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => this.read(chunk));
    socket.on("error", (error) => this.fail(error));
  }

  async run(...parts: string[]): Promise<number | string> {
    const response = new Promise<number | string>((resolve, reject) => {
      this.pending.push({ resolve, reject });
    });
    this.socket.write(command(...parts));
    return response;
  }

  close() {
    this.socket.end();
  }

  private read(chunk: string) {
    this.buffer += chunk;
    while (true) {
      const end = this.buffer.indexOf("\r\n");
      if (end === -1) return;
      const line = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 2);
      const request = this.pending.shift();
      if (!request) continue;
      if (line.startsWith("-")) request.reject(new Error(line.slice(1)));
      else if (line.startsWith(":")) request.resolve(Number(line.slice(1)));
      else if (line.startsWith("+")) request.resolve(line.slice(1));
      else request.reject(new Error(`Unexpected Redis response: ${line}`));
    }
  }

  private fail(error: Error) {
    for (const request of this.pending.splice(0)) request.reject(error);
  }
}

async function connect() {
  const value = process.env.REDIS_URL;
  if (!value) throw new Error("REDIS_URL is required for queue status.");
  const url = new URL(value);
  const port = Number(url.port || 6379);
  const socket =
    url.protocol === "rediss:"
      ? connectTls({ host: url.hostname, port, servername: url.hostname })
      : createConnection({ host: url.hostname, port });
  await waitForConnection(
    socket,
    url.protocol === "rediss:" ? "secureConnect" : "connect",
  );
  const connection = new RedisMonitorConnection(socket);
  const password = decodeURIComponent(url.password);
  const username = decodeURIComponent(url.username);
  if (password) {
    if (username && username !== "default")
      await connection.run("AUTH", username, password);
    else await connection.run("AUTH", password);
  }
  const database = url.pathname.slice(1);
  if (database && database !== "0") await connection.run("SELECT", database);
  return connection;
}

export async function getProjectionJobQueueCounts(): Promise<ProjectionJobQueueCounts> {
  const connection = await connect();
  try {
    const prefix = `bull:${queueName}`;
    const [waiting, active, delayed, prioritized, failed] = await Promise.all([
      connection.run("LLEN", `${prefix}:wait`),
      connection.run("LLEN", `${prefix}:active`),
      connection.run("ZCARD", `${prefix}:delayed`),
      connection.run("ZCARD", `${prefix}:prioritized`),
      connection.run("ZCARD", `${prefix}:failed`),
    ]);
    return {
      waiting: Number(waiting),
      active: Number(active),
      delayed: Number(delayed),
      prioritized: Number(prioritized),
      failed: Number(failed),
    };
  } finally {
    connection.close();
  }
}
