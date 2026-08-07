import { randomUUID } from "node:crypto";
import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";
import { argumentPresent, argumentValue } from "@wcarankings/cli";
import { databaseOptions, recordWorkerHeartbeat } from "@wcarankings/database";
import { enqueueProjectionJob } from "@wcarankings/projection-jobs";
import {
  fetchLiveResults,
  fetchWcaCompetitionScoretakingSoftware,
  LiveResultsNotPublishedError,
  snapshotHash,
} from "@wcarankings/live-results";
import type {
  LiveResultsSnapshot,
  LiveResultsSourceRow,
} from "@wcarankings/live-results";

const POLL_MS = Math.max(
  250,
  Number(process.env.PROVISIONAL_RANKING_WORKER_POLL_MS) || 2_000,
);
const LEASE_SECONDS = Math.max(
  30,
  Number(process.env.PROVISIONAL_RANKING_WORKER_LEASE_SECONDS) || 120,
);
const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TIMEOUT_SECONDS = 90;
const selectedCompetition = argumentValue("competition");
const once = argumentPresent("once");

const activeCompetitionPredicate = `
  competition.cancelled = 0
  AND CURRENT_DATE() BETWEEN
    STR_TO_DATE(
      CONCAT(competition.year, '-', competition.month, '-', competition.day),
      '%Y-%c-%e'
    )
    AND STR_TO_DATE(
      CONCAT(
        competition.end_year,
        '-',
        competition.end_month,
        '-',
        competition.end_day
      ),
      '%Y-%c-%e'
    )`;

type ActiveCompetition = RowDataPacket & {
  id: string;
  year: number;
};

type ProviderStatus = "supported" | "unsupported" | "unknown";

function providerCompatibility(scoretakingSoftware: string | null): {
  enabled: number;
  status: ProviderStatus;
  message: string | null;
} {
  if (scoretakingSoftware === "wca_live")
    return { enabled: 1, status: "supported", message: null };
  if (!scoretakingSoftware)
    return {
      enabled: 0,
      status: "unknown",
      message: "WCA did not report scoretaking software.",
    };
  return {
    enabled: 0,
    status: "unsupported",
    message: `Unsupported scoretaking software: ${scoretakingSoftware}`,
  };
}

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

async function reconcileActiveSources(connection: Connection): Promise<void> {
  const [activeCompetitions] = await connection.query<ActiveCompetition[]>(
    `SELECT competition.id, competition.year
     FROM competitions competition
     WHERE ${activeCompetitionPredicate}`,
  );
  const discovered = await Promise.all(
    activeCompetitions.map(async (competition) => {
      try {
        const scoretakingSoftware =
          await fetchWcaCompetitionScoretakingSoftware(competition.id);
        return {
          ...competition,
          scoretakingSoftware,
          metadataAvailable: true,
          ...providerCompatibility(scoretakingSoftware),
        };
      } catch {
        return {
          ...competition,
          scoretakingSoftware: null,
          metadataAvailable: false,
          enabled: 0,
          status: "unknown" as const,
          message: "WCA scoretaking software is unavailable.",
        };
      }
    }),
  );
  await connection.beginTransaction();
  try {
    await connection.query(
      `UPDATE provisional_live_result_sources source
       LEFT JOIN competitions competition
         ON competition.id = source.competition_id
        AND ${activeCompetitionPredicate}
       SET source.enabled = 0,
           source.lease_token = NULL,
           source.leased_until = NULL
       WHERE competition.id IS NULL AND source.enabled = 1`,
    );
    await connection.query(
      `UPDATE provisional_live_result_sources source
       JOIN competitions competition
         ON competition.id = source.competition_id
        AND ${activeCompetitionPredicate}
       SET source.provider_status = 'supported', source.provider_message = NULL
       WHERE source.source_name = 'cubing-china'`,
    );
    for (const competition of discovered) {
      await connection.query(
        `UPDATE provisional_live_result_sources
         SET scoretaking_software = IF(? = 1, ?, scoretaking_software),
             provider_status = ?, provider_message = ?,
             next_poll_at = IF(? = 1 AND enabled = 0 AND ? = 1, CURRENT_TIMESTAMP(6), next_poll_at),
             enabled = IF(? = 1, ?, enabled)
         WHERE source_name = 'wca-live' AND competition_id = ?`,
        [
          competition.metadataAvailable ? 1 : 0,
          competition.scoretakingSoftware,
          competition.status,
          competition.message,
          competition.metadataAvailable ? 1 : 0,
          competition.enabled,
          competition.metadataAvailable ? 1 : 0,
          competition.enabled,
          competition.id,
        ],
      );
      await connection.query(
        `INSERT INTO provisional_live_result_sources
           (source_name, competition_id, remote_competition_id, competition_year, enabled, scoretaking_software, provider_status, provider_message)
         SELECT 'wca-live', ?, ?, ?, ?, ?, ?, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM provisional_live_result_sources source
           WHERE source.competition_id = ?
         )`,
        [
          competition.id,
          competition.id,
          competition.year,
          competition.enabled,
          competition.scoretakingSoftware,
          competition.status,
          competition.message,
          competition.id,
        ],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function claimSource(
  connection: Connection,
): Promise<LiveResultsSourceRow | null> {
  const token = randomUUID();
  await connection.beginTransaction();
  try {
    const [rows] = await connection.query<
      (LiveResultsSourceRow & RowDataPacket)[]
    >(
      `SELECT source_name, competition_id, remote_competition_id, competition_year
       FROM provisional_live_result_sources
       WHERE enabled = 1 AND (? = '' OR competition_id = ?)
         AND (? <> '' OR (next_poll_at <= CURRENT_TIMESTAMP(6)
           AND (leased_until IS NULL OR leased_until < CURRENT_TIMESTAMP(6))))
       ORDER BY next_poll_at, competition_id LIMIT 1 FOR UPDATE SKIP LOCKED`,
      [selectedCompetition, selectedCompetition, selectedCompetition],
    );
    const source = rows[0];
    if (!source) {
      await connection.commit();
      return null;
    }
    await connection.query(
      `UPDATE provisional_live_result_sources SET lease_token = ?,
       leased_until = DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL ? SECOND)
       WHERE source_name = ? AND competition_id = ?`,
      [token, LEASE_SECONDS, source.source_name, source.competition_id],
    );
    await connection.commit();
    return {
      ...source,
      competition_year: Number(source.competition_year),
      lease_token: token,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

function partitionJobs(
  source: LiveResultsSourceRow,
  snapshot: LiveResultsSnapshot,
  version: number,
) {
  const jobs = new Map<string, Record<string, string>>();
  const add = (key: string, payload: Record<string, string>) =>
    jobs.set(key, payload);
  add(`competition-stats:${source.competition_id}`, {
    competitionId: source.competition_id,
    year: String(source.competition_year),
  });
  for (const result of snapshot.results) {
    add(`person-stats:${result.personId}:${source.competition_year}`, {
      personId: result.personId,
      year: String(source.competition_year),
    });
    const region = result.countryIso2 ?? "unknown";
    for (const resultType of ["single", "average"]) {
      add(
        `rankings:${result.eventId}:${resultType}:country:${region}:${source.competition_year}`,
        {
          eventId: result.eventId,
          resultType,
          region,
          year: String(source.competition_year),
          provisional: "true",
        },
      );
    }
  }
  return [...jobs].map(([key, payload]) => ({
    kind: "projection-rebuild" as const,
    key,
    version,
    payload,
  }));
}

async function saveSnapshot(
  connection: Connection,
  source: LiveResultsSourceRow,
): Promise<void> {
  let snapshot: LiveResultsSnapshot | undefined;
  let hash: string;
  let version: number | null = null;
  let needsQueue: boolean;
  let transactionOpen = false;
  try {
    snapshot = await fetchLiveResults(
      source.source_name,
      source.remote_competition_id,
    );
    hash = snapshotHash(snapshot);
    await connection.beginTransaction();
    transactionOpen = true;
    const [state] = await connection.query<RowDataPacket[]>(
      `SELECT snapshot_hash, queued_snapshot_hash FROM provisional_live_result_sources
       WHERE source_name = ? AND competition_id = ? AND lease_token = ? FOR UPDATE`,
      [source.source_name, source.competition_id, source.lease_token],
    );
    if (!state[0]) throw new Error("Live result source lease was lost.");
    needsQueue = stateNeedsQueue(state[0], hash);
    if (state[0].snapshot_hash !== hash) {
      await connection.query(
        "DELETE FROM provisional_live_results WHERE source_name = ? AND competition_id = ?",
        [source.source_name, source.competition_id],
      );
      for (const result of snapshot.results)
        await connection.query(
          `INSERT INTO provisional_live_results
         (source_name, competition_id, source_result_id, event_id, round_number, round_type_id, format_id, person_id, person_name, country_iso2, best, average, position, attempts_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            source.source_name,
            source.competition_id,
            result.sourceResultId,
            result.eventId,
            result.roundNumber,
            result.roundTypeId,
            result.formatId,
            result.personId,
            result.personName,
            result.countryIso2,
            result.best,
            result.average,
            result.position,
            JSON.stringify(result.attempts),
          ],
        );
      await connection.query(
        "UPDATE provisional_live_result_state SET source_version = source_version + 1 WHERE id = 1",
      );
      const [versions] = await connection.query<RowDataPacket[]>(
        "SELECT source_version FROM provisional_live_result_state WHERE id = 1",
      );
      version = Number(versions[0]?.source_version);
    }
    await connection.query(
      `UPDATE provisional_live_result_sources SET snapshot_hash = ?, last_success_at = CURRENT_TIMESTAMP(6), last_error = NULL,
       next_poll_at = DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL poll_seconds SECOND), lease_token = NULL, leased_until = NULL
       WHERE source_name = ? AND competition_id = ? AND lease_token = ?`,
      [hash, source.source_name, source.competition_id, source.lease_token],
    );
    await connection.commit();
    transactionOpen = false;
  } catch (error) {
    if (transactionOpen) await connection.rollback();
    if (error instanceof LiveResultsNotPublishedError) {
      await connection.query(
        `UPDATE provisional_live_result_sources SET lease_token = NULL, leased_until = NULL,
         next_poll_at = DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL poll_seconds SECOND), last_error = ?
         WHERE source_name = ? AND competition_id = ? AND lease_token = ?`,
        [
          error.message,
          source.source_name,
          source.competition_id,
          source.lease_token,
        ],
      );
      return;
    }
    await connection.query(
      `UPDATE provisional_live_result_sources SET lease_token = NULL, leased_until = NULL,
      next_poll_at = DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL 60 SECOND), last_error = ?
      WHERE source_name = ? AND competition_id = ? AND lease_token = ?`,
      [
        String(error instanceof Error ? error.message : error).slice(0, 1000),
        source.source_name,
        source.competition_id,
        source.lease_token,
      ],
    );
    throw error;
  }
  if (needsQueue) {
    if (!snapshot) throw new Error("Live result snapshot is missing.");
    const queuedVersion = version ?? (await currentSourceVersion(connection));
    for (const job of partitionJobs(source, snapshot, queuedVersion))
      await enqueueProjectionJob(job);
    await connection.query(
      `UPDATE provisional_live_result_sources SET queued_snapshot_hash = ?
       WHERE source_name = ? AND competition_id = ? AND snapshot_hash = ?`,
      [hash, source.source_name, source.competition_id, hash],
    );
  }
}

function stateNeedsQueue(state: RowDataPacket, hash: string): boolean {
  return state.queued_snapshot_hash !== hash;
}

async function currentSourceVersion(connection: Connection): Promise<number> {
  const [rows] = await connection.query<RowDataPacket[]>(
    "SELECT source_version FROM provisional_live_result_state WHERE id = 1",
  );
  return Number(rows[0]?.source_version);
}

async function main(): Promise<void> {
  const connection = await mysql.createConnection(databaseOptions());
  try {
    let reconciledDay = "";
    let lastHeartbeatAt = 0;
    async function heartbeat(force = false): Promise<void> {
      const now = Date.now();
      if (!force && now - lastHeartbeatAt < HEARTBEAT_INTERVAL_MS) return;
      await recordWorkerHeartbeat(connection, {
        workerName: "live-results-poller",
        timeoutSeconds: HEARTBEAT_TIMEOUT_SECONDS,
        details: {
          mode: selectedCompetition ? "manual" : once ? "once" : "scheduled",
          pollIntervalMs: POLL_MS,
        },
      });
      lastHeartbeatAt = now;
    }
    async function reconcileForToday(): Promise<void> {
      const day = utcDay();
      if (day === reconciledDay) return;
      await reconcileActiveSources(connection);
      reconciledDay = day;
      await logActiveSources(connection);
    }

    await reconcileForToday();
    await heartbeat(true);
    do {
      await heartbeat();
      await reconcileForToday();
      const source = await claimSource(connection);
      if (source) {
        try {
          await saveSnapshot(connection, source);
        } catch (error) {
          process.stderr.write(
            `Live poll failed for ${source.source_name}:${source.competition_id}: ${error instanceof Error ? error.message : String(error)}\n`,
          );
        }
      }
      if (once || selectedCompetition) return;
      if (!source) await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    } while (true);
  } finally {
    await connection.end();
  }
}

async function logActiveSources(connection: Connection): Promise<void> {
  const [sources] = await connection.query<RowDataPacket[]>(
    `SELECT source_name, competition_id, next_poll_at
     FROM provisional_live_result_sources
     WHERE enabled = 1
     ORDER BY competition_id`,
  );
  process.stdout.write(
    `Live poller sources: ${sources.length === 0 ? "none" : sources.map((source) => `${source.source_name}:${source.competition_id} (next ${source.next_poll_at})`).join(", ")}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
