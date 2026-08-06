import { createServer } from "node:http";
import {
  ensureFeedItems,
  seedFeedStatPreviews,
} from "../services/feeds/stat-previews";
import { runListRankingWorker } from "./list-ranking-worker";

const HOST = process.env.WORKER_HOST ?? "127.0.0.1";
const PORT = Number(process.env.WORKER_PORT ?? 3010);

let feedBuild: Promise<unknown> | null = null;
let feedSeed: Promise<unknown> | null = null;

function startFeedBuild() {
  if (feedBuild) return feedBuild;
  feedBuild = ensureFeedItems()
    .then((result) => {
      process.stdout.write(
        `Feed items ${result.written ? "written" : "already current"}: ${result.candidateCount} candidates (${result.exportVersion})\n`,
      );
      return result;
    })
    .catch((error) => {
      process.stderr.write(
        `Feed item build failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
      );
      throw error;
    })
    .finally(() => {
      feedBuild = null;
    });
  return feedBuild;
}

function startFeedSeed() {
  if (feedSeed) return feedSeed;
  feedSeed = seedFeedStatPreviews()
    .then((seeded) => {
      process.stdout.write(`Feed stat cache seeded: ${seeded} items\n`);
    })
    .catch((error) => {
      process.stderr.write(
        `Feed stat cache seeding failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
      );
    })
    .finally(() => {
      feedSeed = null;
    });
  return feedSeed;
}

function sendJson(
  response: import("node:http").ServerResponse,
  status: number,
  body: unknown,
) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }
  if (request.method !== "POST" || request.url !== "/jobs") {
    sendJson(response, 404, { error: "Not found." });
    return;
  }

  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    body += chunk;
  });
  request.on("end", () => {
    let job: { type?: string };
    try {
      job = JSON.parse(body || "{}");
    } catch {
      sendJson(response, 400, { error: "Invalid JSON." });
      return;
    }
    if (job.type !== "feed.generate") {
      sendJson(response, 400, { error: "Unknown job type." });
      return;
    }
    void startFeedBuild()
      .then(() => sendJson(response, 202, { accepted: true }))
      .catch(() => sendJson(response, 500, { error: "Feed job failed." }));
  });
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`Background worker listening on ${HOST}:${PORT}\n`);
  void startFeedBuild().then(() => startFeedSeed());
  setInterval(() => void startFeedBuild(), 60_000).unref();
  void runListRankingWorker().catch((error: unknown) => {
    process.stderr.write(
      `List ranking worker failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 1;
  });
});
