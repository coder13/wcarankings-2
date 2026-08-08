import { createServer, type Server, type ServerResponse } from "node:http";

export type WorkerHealthState = "starting" | "ready" | "stopping";

export type WorkerHealthPayload = {
  status: "ok";
  worker: string;
  state: WorkerHealthState;
  processId: number;
  startedAt: string;
};

type WorkerHealthServerOptions = {
  hostname?: string;
  onRestart?: () => void;
  port: number;
  workerName: string;
};

export type WorkerHealthServer = {
  close: () => Promise<void>;
  setState: (state: WorkerHealthState) => void;
};

function writeHealthResponse(
  response: ServerResponse,
  payload: WorkerHealthPayload,
): void {
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}

export function createWorkerHealthServer({
  hostname = "0.0.0.0",
  onRestart,
  port,
  workerName,
}: WorkerHealthServerOptions): Promise<WorkerHealthServer> {
  let state: WorkerHealthState = "starting";
  const startedAt = new Date().toISOString();
  const server: Server = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      writeHealthResponse(response, {
        status: "ok",
        worker: workerName,
        state,
        processId: process.pid,
        startedAt,
      });
      return;
    }
    if (request.method === "POST" && request.url === "/restart") {
      if (!onRestart) {
        response.writeHead(404);
        response.end();
        return;
      }
      response.writeHead(202, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ status: "restarting" }));
      setTimeout(onRestart, 50);
      return;
    }
    response.writeHead(404);
    response.end();
  });

  return new Promise((resolve, reject) => {
    const handleError = (error: Error) => {
      server.off("listening", handleListening);
      reject(error);
    };
    const handleListening = () => {
      server.off("error", handleError);
      resolve({
        close: () =>
          new Promise<void>((closeResolve, closeReject) => {
            state = "stopping";
            server.close((error) =>
              error ? closeReject(error) : closeResolve(),
            );
          }),
        setState: (nextState) => {
          state = nextState;
        },
      });
    };
    server.once("error", handleError);
    server.once("listening", handleListening);
    server.listen(port, hostname);
  });
}
