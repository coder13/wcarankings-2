import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import type { Writable } from "node:stream";
import type { ChunkProjectionDumpInput } from "./types.ts";

interface ImportProcessResult {
  completed: Promise<void>;
  output: Writable;
}

function importProcess(): ImportProcessResult {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required with --import");
  }
  const url = new URL(process.env.DATABASE_URL);
  const database =
    process.env.DATABASE_NAME_OVERRIDE ||
    decodeURIComponent(url.pathname.replace(/^\//, ""));
  const child = spawn(
    "mariadb",
    [
      "--protocol=TCP",
      `--host=${url.hostname}`,
      `--port=${url.port || 3306}`,
      `--user=${decodeURIComponent(url.username)}`,
      database,
    ],
    {
      env: { ...process.env, MYSQL_PWD: decodeURIComponent(url.password) },
      stdio: ["pipe", "inherit", "inherit"],
    },
  );
  if (!child.stdin) {
    throw new Error("mariadb input stream is not available");
  }
  const completed = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `mariadb import failed with ${signal ? `signal ${signal}` : `exit code ${code}`}`,
        ),
      );
    });
  });
  return { output: child.stdin, completed };
}

async function writeLine(output: Writable, line: string): Promise<void> {
  if (!output.write(`${line}\n`)) await once(output, "drain");
}

export async function chunkProjectionDump(
  input: ChunkProjectionDumpInput,
): Promise<void> {
  if (!Number.isSafeInteger(input.rowsPerInsert) || input.rowsPerInsert < 1) {
    throw new Error("rowsPerInsert must be a positive integer");
  }
  const importer = input.importDump ? importProcess() : undefined;
  const output = importer?.output ?? input.output;
  const lines = createInterface({ input: input.input, crlfDelay: Infinity });
  let insertHeader: string | undefined;
  let rowsInBatch = 0;

  for await (const line of lines) {
    if (!insertHeader) {
      if (/^INSERT INTO `[^`]+` VALUES$/.test(line)) {
        insertHeader = line;
        rowsInBatch = 0;
        await writeLine(output, "SET autocommit=0;");
      }
      await writeLine(output, line);
      continue;
    }

    if (!line.startsWith("(") || !/[;,]$/.test(line)) {
      throw new Error(`Malformed projection dump row after ${insertHeader}`);
    }
    rowsInBatch += 1;
    const finalRow = line.endsWith(";");
    if (!finalRow && rowsInBatch >= input.rowsPerInsert) {
      await writeLine(output, `${line.slice(0, -1)};`);
      await writeLine(output, insertHeader);
      rowsInBatch = 0;
    } else {
      await writeLine(output, line);
    }
    if (finalRow) {
      await writeLine(output, "COMMIT;");
      await writeLine(output, "SET autocommit=1;");
      insertHeader = undefined;
      rowsInBatch = 0;
    }
  }

  if (insertHeader) {
    throw new Error(`Truncated projection dump after ${insertHeader}`);
  }
  if (importer) {
    output.end();
    await importer.completed;
  }
}
