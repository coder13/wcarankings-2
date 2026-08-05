import { argumentPresent, argumentValue } from "../../lib/arguments.ts";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { spawn } from "node:child_process";

const rowsPerInsert = Number(argumentValue("rows-per-insert") || 1000);
const importDump = argumentPresent("import");

if (!Number.isSafeInteger(rowsPerInsert) || rowsPerInsert < 1) {
  throw new Error("--rows-per-insert must be a positive integer.");
}

function importProcess() {
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is required with --import.");
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
  const completed = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `mariadb import failed with ${signal ? `signal ${signal}` : `exit code ${code}`}.`,
          ),
        );
    });
  });
  return { output: child.stdin, completed };
}

const importer = importDump ? importProcess() : undefined;
const output = importer?.output || process.stdout;

async function writeLine(line) {
  if (!output.write(`${line}\n`)) await once(output, "drain");
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
let insertHeader;
let rowsInBatch = 0;

for await (const line of lines) {
  if (!insertHeader) {
    if (/^INSERT INTO `[^`]+` VALUES$/.test(line)) {
      insertHeader = line;
      rowsInBatch = 0;
      await writeLine("SET autocommit=0;");
    }
    await writeLine(line);
    continue;
  }

  if (!line.startsWith("(") || !/[;,]$/.test(line)) {
    throw new Error(`Malformed projection dump row after ${insertHeader}.`);
  }

  rowsInBatch += 1;
  const finalRow = line.endsWith(";");
  if (!finalRow && rowsInBatch >= rowsPerInsert) {
    await writeLine(`${line.slice(0, -1)};`);
    await writeLine(insertHeader);
    rowsInBatch = 0;
  } else {
    await writeLine(line);
  }

  if (finalRow) {
    await writeLine("COMMIT;");
    await writeLine("SET autocommit=1;");
    insertHeader = undefined;
    rowsInBatch = 0;
  }
}

if (insertHeader)
  throw new Error(`Truncated projection dump after ${insertHeader}.`);
if (importer) {
  output.end();
  await importer.completed;
}
