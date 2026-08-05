import { readFile } from "node:fs/promises";
import mysql from "mysql2/promise";
import { argumentValue } from "../../lib/arguments.ts";
import { databaseOptions } from "../../lib/database.ts";
import {
  activateGeneration,
  bootstrapGenerationState,
  rollbackGeneration,
} from "../../../data-tools/projections/deployment/generation/activate.ts";
import { activeState } from "../../../data-tools/projections/deployment/generation/database.ts";
import { parseGenerationManifest } from "../../../data-tools/projections/deployment/generation/manifest.ts";
import { matchesActiveGeneration } from "../../../data-tools/projections/deployment/generation/state.ts";
import type { GenerationManifest } from "../../../data-tools/projections/deployment/generation/types.ts";

async function readManifest(path: string): Promise<GenerationManifest> {
  if (path !== "-") {
    return parseGenerationManifest(JSON.parse(await readFile(path, "utf8")));
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return parseGenerationManifest(
    JSON.parse(Buffer.concat(chunks).toString("utf8")),
  );
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const options = databaseOptions();
  const productionSchema = options.database;
  const candidateSchema = argumentValue("candidate-schema");
  const previousSchema = `${candidateSchema}_previous`;
  const connection = await mysql.createConnection(options);
  try {
    if (command === "activate") {
      const manifest = await readManifest(argumentValue("manifest") || "-");
      const result = await activateGeneration({
        connection,
        productionSchema,
        candidateSchema,
        previousSchema,
        manifest,
        artifactRunId: argumentValue("artifact-run-id"),
        artifactId: argumentValue("artifact-id"),
      });
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return;
    }
    if (command === "verify-active") {
      const manifest = await readManifest(argumentValue("manifest") || "-");
      const state = await activeState(connection, productionSchema);
      const matches = matchesActiveGeneration({
        activeState: state,
        manifest,
        artifactRunId: argumentValue("artifact-run-id"),
        artifactId: argumentValue("artifact-id"),
      });
      process.stdout.write(`${JSON.stringify({ matches, state })}\n`);
      if (!matches) process.exitCode = 2;
      return;
    }
    if (command === "rollback") {
      const result = await rollbackGeneration({
        connection,
        productionSchema,
        candidateSchema,
        artifactId: argumentValue("artifact-id"),
      });
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return;
    }
    if (command === "state") {
      const state = (await activeState(connection, productionSchema)) ?? {};
      process.stdout.write(`${JSON.stringify(state)}\n`);
      return;
    }
    if (command === "bootstrap") {
      const result = await bootstrapGenerationState({
        connection,
        productionSchema,
      });
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return;
    }
    throw new Error(
      "Use activate-ranking-generation.ts activate, verify-active, rollback, state, or bootstrap",
    );
  } finally {
    await connection.end();
  }
}

if (import.meta.main) await main();
