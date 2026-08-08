import { randomUUID } from "node:crypto";
import mysql from "mysql2/promise";
import type {
  Connection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import { argumentPresent, argumentValue } from "@wcarankings/cli";
import { databaseOptions, recordWorkerHeartbeat } from "@wcarankings/database";
import {
  closeProjectionJobQueue,
  enqueueProjectionJob,
  type ProjectionJobEnqueueOutcome,
} from "@wcarankings/projection-jobs";
import {
  closeWorkerLogger,
  createWorkerLogger,
  type WorkerLogger,
} from "@wcarankings/worker-logging";
import {
  fetchLiveResults,
  fetchWcaCompetitionScoretakingSoftware,
  LiveResultsNotPublishedError,
  liveResultRoundKey,
  roundSnapshotHashes,
  snapshotHash,
} from "@wcarankings/live-results";
import type {
  LiveResultsSnapshot,
  LiveResultsSourceRow,
} from "@wcarankings/live-results";
import {
  partitionJobs,
  type CountryRegion,
  type PersonRegion,
  type SnapshotResultIdentity,
} from "./job-partitions.ts";

const POLL_MS = Math.max(
  60_000,
  Number(process.env.PROVISIONAL_RANKING_WORKER_POLL_MS) || 60_000,
);
const LEASE_SECONDS = Math.max(
  30,
  Number(process.env.PROVISIONAL_RANKING_WORKER_LEASE_SECONDS) || 120,
);
const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TIMEOUT_SECONDS = 90;
const SETTINGS_REFRESH_INTERVAL_MS = 60_000;
const selectedCompetition = argumentValue("competition");
const once = argumentPresent("once");
let shutdownSignal: "SIGINT" | "SIGTERM" | null = null;
let resolveShutdownRequest: (() => void) | undefined;
const shutdownRequested = new Promise<void>((resolve) => {
  resolveShutdownRequest = resolve;
});

function requestShutdown(signal: "SIGINT" | "SIGTERM"): void {
  if (shutdownSignal) return;
  shutdownSignal = signal;
  resolveShutdownRequest?.();
}

process.once("SIGINT", () => requestShutdown("SIGINT"));
process.once("SIGTERM", () => requestShutdown("SIGTERM"));

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

type SnapshotRound = {
  eventId: string;
  roundNumber: number;
  snapshotHash: string;
};

type RoundHashRow = RowDataPacket & {
  eventId: string;
  roundNumber: number;
  snapshotHash: string;
};

type CountryRegionRow = RowDataPacket & {
  continentId: string;
  countryId: string;
  iso2: string;
};

type PersonRegionRow = RowDataPacket & {
  continentId: string;
  countryId: string;
  gender: "m" | "f" | "o";
  personId: string;
};

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

function snapshotRounds(
  snapshot: LiveResultsSnapshot,
): Map<string, SnapshotRound> {
  const hashes = roundSnapshotHashes(snapshot);
  const rounds = new Map<string, SnapshotRound>();
  for (const result of snapshot.results) {
    const key = liveResultRoundKey(result);
    if (rounds.has(key)) continue;
    const snapshotHash = hashes.get(key);
    if (!snapshotHash) throw new Error(`Round hash is missing for ${key}.`);
    rounds.set(key, {
      eventId: result.eventId,
      roundNumber: result.roundNumber,
      snapshotHash,
    });
  }
  return rounds;
}

function roundPredicate(rounds: readonly SnapshotRound[]): string {
  return rounds.map(() => "(event_id = ? AND round_number = ?)").join(" OR ");
}

function roundParameters(
  rounds: readonly SnapshotRound[],
): (string | number)[] {
  return rounds.flatMap((round) => [round.eventId, round.roundNumber]);
}

function resultsForRounds(
  snapshot: LiveResultsSnapshot,
  rounds: ReadonlyMap<string, SnapshotRound>,
): LiveResultsSnapshot {
  return {
    results: snapshot.results.filter((result) =>
      rounds.has(liveResultRoundKey(result)),
    ),
  };
}

async function reconcileActiveSources(
  connection: Connection,
  logger: WorkerLogger,
): Promise<void> {
  const startedAt = performance.now();
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
    const [disabled] = await connection.query<ResultSetHeader>(
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
    await connection.query(
      `DELETE round_hash FROM provisional_live_result_round_hashes round_hash
       JOIN provisional_live_result_sources source
         ON source.source_name = round_hash.source_name
        AND source.competition_id = round_hash.competition_id
       WHERE source.enabled = 0`,
    );
    await connection.commit();
    const sourceStatuses = discovered.reduce(
      (counts, source) => {
        counts[source.status] += 1;
        return counts;
      },
      { supported: 0, unknown: 0, unsupported: 0 },
    );
    logger.info(`Reconciled ${discovered.length} live sources.`, {
      discoveredCount: discovered.length,
      disabledCount: disabled.affectedRows,
      sourceStatuses,
      durationMs: Math.round(performance.now() - startedAt),
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function applyPollingSettings(
  connection: Connection,
  logger: WorkerLogger,
): Promise<void> {
  const [updated] = await connection.query<ResultSetHeader>(
    `UPDATE provisional_live_result_sources source
     JOIN live_results_settings settings ON settings.id = 1
     SET source.next_poll_at = IF(
           source.poll_seconds <> settings.poll_seconds,
           DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL settings.poll_seconds SECOND),
           source.next_poll_at
         ),
         source.poll_seconds = settings.poll_seconds
     WHERE source.source_name = 'wca-live'
       AND source.enabled = 1
       AND source.provider_status = 'supported'
       AND source.poll_seconds <> settings.poll_seconds`,
  );
  if (updated.affectedRows > 0)
    logger.info(
      `Updated polling settings for ${updated.affectedRows} sources.`,
      {
        sourceCount: updated.affectedRows,
      },
    );
}

async function claimSource(
  connection: Connection,
  logger: WorkerLogger,
): Promise<LiveResultsSourceRow | null> {
  const startedAt = performance.now();
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
      logger.debug("No live source is due.", {
        durationMs: Math.round(performance.now() - startedAt),
      });
      return null;
    }
    await connection.query(
      `UPDATE provisional_live_result_sources SET lease_token = ?,
       leased_until = DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL ? SECOND)
       WHERE source_name = ? AND competition_id = ?`,
      [token, LEASE_SECONDS, source.source_name, source.competition_id],
    );
    await connection.commit();
    logger.debug(
      `Claimed live source: ${source.source_name}:${source.competition_id}.`,
      {
        sourceName: source.source_name,
        competitionId: source.competition_id,
        leaseSeconds: LEASE_SECONDS,
        durationMs: Math.round(performance.now() - startedAt),
      },
    );
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

async function saveSnapshot(
  connection: Connection,
  source: LiveResultsSourceRow,
  logger: WorkerLogger,
): Promise<void> {
  const startedAt = performance.now();
  const fetchStartedAt = performance.now();
  let snapshot: LiveResultsSnapshot | undefined;
  let fetchDurationMs = 0;
  let hash: string;
  let version: number | null = null;
  let needsQueue: boolean;
  let previousResults: SnapshotResultIdentity[] = [];
  let changedSnapshot: LiveResultsSnapshot | null = null;
  let changedRoundCount = 0;
  let removedRoundCount = 0;
  let changedRoundKeys: string[] = [];
  let removedRoundKeys: string[] = [];
  let deletedResultCount = 0;
  let usedRoundBaseline = false;
  let snapshotChanged = false;
  let transactionOpen = false;
  try {
    snapshot = await fetchLiveResults(
      source.source_name,
      source.remote_competition_id,
    );
    fetchDurationMs = Math.round(performance.now() - fetchStartedAt);
    hash = snapshotHash(snapshot);
    const incomingRounds = snapshotRounds(snapshot);
    logger.debug("Fetched live results.", {
      sourceName: source.source_name,
      competitionId: source.competition_id,
      resultCount: snapshot.results.length,
      roundCount: incomingRounds.size,
      durationMs: fetchDurationMs,
    });
    await connection.beginTransaction();
    transactionOpen = true;
    const [state] = await connection.query<RowDataPacket[]>(
      `SELECT snapshot_hash, queued_snapshot_hash FROM provisional_live_result_sources
       WHERE source_name = ? AND competition_id = ? AND lease_token = ? FOR UPDATE`,
      [source.source_name, source.competition_id, source.lease_token],
    );
    if (!state[0]) throw new Error("Live result source lease was lost.");
    const [storedRoundRows] = await connection.query<RoundHashRow[]>(
      `SELECT event_id AS eventId, round_number AS roundNumber,
        snapshot_hash AS snapshotHash
       FROM provisional_live_result_round_hashes
       WHERE source_name = ? AND competition_id = ? FOR UPDATE`,
      [source.source_name, source.competition_id],
    );
    const storedRounds = new Map(
      storedRoundRows.map((round) => [
        `${round.eventId}:${round.roundNumber}`,
        round,
      ]),
    );
    needsQueue = stateNeedsQueue(state[0], hash);
    if (state[0].snapshot_hash !== hash) {
      snapshotChanged = true;
      const needsRoundBaseline =
        Boolean(state[0].snapshot_hash) && storedRoundRows.length === 0;
      const changedRounds = needsRoundBaseline
        ? incomingRounds
        : new Map(
            [...incomingRounds].filter(
              ([key, round]) =>
                storedRounds.get(key)?.snapshotHash !== round.snapshotHash,
            ),
          );
      const removedRounds = needsRoundBaseline
        ? []
        : storedRoundRows.filter(
            (round) =>
              !incomingRounds.has(`${round.eventId}:${round.roundNumber}`),
          );
      const affectedRounds = [
        ...changedRounds.values(),
        ...removedRounds.map((round) => ({
          eventId: round.eventId,
          roundNumber: Number(round.roundNumber),
          snapshotHash: round.snapshotHash,
        })),
      ];
      changedRoundCount = changedRounds.size;
      removedRoundCount = removedRounds.length;
      changedRoundKeys = [...changedRounds.keys()];
      removedRoundKeys = removedRounds.map(
        (round) => `${round.eventId}:${round.roundNumber}`,
      );
      usedRoundBaseline = needsRoundBaseline;
      changedSnapshot = resultsForRounds(snapshot, changedRounds);
      if (needsRoundBaseline) {
        const [rows] = await connection.query<
          (SnapshotResultIdentity & RowDataPacket)[]
        >(
          `SELECT person_id AS personId, event_id AS eventId,
            country_iso2 AS countryIso2
           FROM provisional_live_results
           WHERE source_name = ? AND competition_id = ?`,
          [source.source_name, source.competition_id],
        );
        previousResults = rows;
        deletedResultCount = rows.length;
        await connection.query(
          "DELETE FROM provisional_live_results WHERE source_name = ? AND competition_id = ?",
          [source.source_name, source.competition_id],
        );
        await connection.query(
          `DELETE FROM provisional_live_result_round_hashes
           WHERE source_name = ? AND competition_id = ?`,
          [source.source_name, source.competition_id],
        );
      } else if (affectedRounds.length) {
        const predicate = roundPredicate(affectedRounds);
        const parameters = roundParameters(affectedRounds);
        const [rows] = await connection.query<
          (SnapshotResultIdentity & RowDataPacket)[]
        >(
          `SELECT person_id AS personId, event_id AS eventId,
            country_iso2 AS countryIso2
           FROM provisional_live_results
           WHERE source_name = ? AND competition_id = ? AND (${predicate})`,
          [source.source_name, source.competition_id, ...parameters],
        );
        previousResults = rows;
        deletedResultCount = rows.length;
        await connection.query(
          `DELETE FROM provisional_live_results
           WHERE source_name = ? AND competition_id = ? AND (${predicate})`,
          [source.source_name, source.competition_id, ...parameters],
        );
        await connection.query(
          `DELETE FROM provisional_live_result_round_hashes
           WHERE source_name = ? AND competition_id = ? AND (${predicate})`,
          [source.source_name, source.competition_id, ...parameters],
        );
      }
      for (const result of changedSnapshot.results)
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
      for (const round of changedRounds.values())
        await connection.query(
          `INSERT INTO provisional_live_result_round_hashes
             (source_name, competition_id, event_id, round_number, snapshot_hash)
             VALUES (?, ?, ?, ?, ?)`,
          [
            source.source_name,
            source.competition_id,
            round.eventId,
            round.roundNumber,
            round.snapshotHash,
          ],
        );
      await connection.query(
        "UPDATE provisional_live_result_state SET source_version = source_version + 1 WHERE id = 1",
      );
      const [versions] = await connection.query<RowDataPacket[]>(
        "SELECT source_version FROM provisional_live_result_state WHERE id = 1",
      );
      version = Number(versions[0]?.source_version);
    } else if (
      storedRoundRows.length !== incomingRounds.size ||
      storedRoundRows.some(
        (round) =>
          incomingRounds.get(`${round.eventId}:${round.roundNumber}`)
            ?.snapshotHash !== round.snapshotHash,
      )
    ) {
      await connection.query(
        `DELETE FROM provisional_live_result_round_hashes
         WHERE source_name = ? AND competition_id = ?`,
        [source.source_name, source.competition_id],
      );
      for (const round of incomingRounds.values())
        await connection.query(
          `INSERT INTO provisional_live_result_round_hashes
           (source_name, competition_id, event_id, round_number, snapshot_hash)
           VALUES (?, ?, ?, ?, ?)`,
          [
            source.source_name,
            source.competition_id,
            round.eventId,
            round.roundNumber,
            round.snapshotHash,
          ],
        );
    }
    await connection.query(
      `UPDATE provisional_live_result_sources SET snapshot_hash = ?, last_success_at = CURRENT_TIMESTAMP(6),
       last_imported_at = IF(? = 1, CURRENT_TIMESTAMP(6), last_imported_at), last_error = NULL,
       next_poll_at = DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL poll_seconds SECOND), lease_token = NULL, leased_until = NULL
       WHERE source_name = ? AND competition_id = ? AND lease_token = ?`,
      [
        hash,
        snapshotChanged ? 1 : 0,
        source.source_name,
        source.competition_id,
        source.lease_token,
      ],
    );
    await connection.commit();
    transactionOpen = false;
    const totalDurationMs = Math.round(performance.now() - startedAt);
    if (changedSnapshot) {
      logger.info(
        `Updated ${source.source_name}:${source.competition_id}: ${changedSnapshot.results.length} results in ${totalDurationMs}ms.`,
        {
          sourceName: source.source_name,
          competitionId: source.competition_id,
          changedRoundCount,
          removedRoundCount,
          changedRoundKeys,
          removedRoundKeys,
          usedRoundBaseline,
          deletedResultCount,
          resultCount: changedSnapshot.results.length,
          fetchDurationMs,
          databaseDurationMs: totalDurationMs - fetchDurationMs,
          totalDurationMs,
        },
      );
    } else {
      logger.debug("Live results were unchanged.", {
        sourceName: source.source_name,
        competitionId: source.competition_id,
        resultCount: snapshot.results.length,
        fetchDurationMs,
        databaseDurationMs: totalDurationMs - fetchDurationMs,
        totalDurationMs,
      });
    }
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
      logger.info(
        `Live results are not published: ${source.source_name}:${source.competition_id}.`,
        {
          sourceName: source.source_name,
          competitionId: source.competition_id,
          durationMs: Math.round(performance.now() - startedAt),
        },
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
    const resultsForJobs = [
      ...previousResults,
      ...(changedSnapshot ?? snapshot).results.map((result) => ({
        countryIso2: result.countryIso2,
        eventId: result.eventId,
        personId: result.personId,
      })),
    ];
    const countryRegionsByIso2 = await countryRegionsFor(
      connection,
      resultsForJobs,
    );
    const personRegionsById = await personRegionsFor(
      connection,
      resultsForJobs,
    );
    const jobs = partitionJobs(
      source,
      changedSnapshot ?? snapshot,
      queuedVersion,
      previousResults,
      countryRegionsByIso2,
      personRegionsById,
    );
    const queueStartedAt = performance.now();
    const outcomes: Record<ProjectionJobEnqueueOutcome, number> = {
      added: 0,
      unchanged: 0,
      updated: 0,
    };
    for (const job of jobs) {
      try {
        outcomes[await enqueueProjectionJob(job)] += 1;
      } catch (error) {
        logger.error(`Projection enqueue failed: ${job.key}.`, {
          sourceName: source.source_name,
          competitionId: source.competition_id,
          sourceVersion: queuedVersion,
          job,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        throw error;
      }
    }
    logger.info(
      `Queued ${jobs.length} projection rebuilds for ${source.competition_id}.`,
      {
        sourceName: source.source_name,
        competitionId: source.competition_id,
        jobCount: jobs.length,
        outcomes,
        sourceVersion: queuedVersion,
        durationMs: Math.round(performance.now() - queueStartedAt),
      },
    );
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

async function countryRegionsFor(
  connection: Connection,
  results: SnapshotResultIdentity[],
): Promise<Map<string, CountryRegion>> {
  const iso2Codes = [
    ...new Set(
      results.flatMap((result) =>
        result.countryIso2 ? [result.countryIso2] : [],
      ),
    ),
  ];
  if (iso2Codes.length === 0) return new Map();
  const placeholders = iso2Codes.map(() => "?").join(", ");
  const [rows] = await connection.query<CountryRegionRow[]>(
    `SELECT iso2, id AS countryId, continent_id AS continentId
     FROM countries
     WHERE iso2 IN (${placeholders})`,
    iso2Codes,
  );
  return new Map(
    rows.map((row) => [
      row.iso2,
      { countryId: row.countryId, continentId: row.continentId },
    ]),
  );
}

async function personRegionsFor(
  connection: Connection,
  results: SnapshotResultIdentity[],
): Promise<Map<string, PersonRegion>> {
  const personIds = [...new Set(results.map((result) => result.personId))];
  if (personIds.length === 0) return new Map();
  const placeholders = personIds.map(() => "?").join(", ");
  const [rows] = await connection.query<PersonRegionRow[]>(
    `SELECT person.wca_id AS personId, person.country_id AS countryId,
      country.continent_id AS continentId,
      CASE WHEN person.gender IN ('m', 'f') THEN person.gender ELSE 'o' END AS gender
     FROM persons person
     INNER JOIN countries country ON country.id = person.country_id
     WHERE person.sub_id = 1
       AND person.wca_id IN (${placeholders})`,
    personIds,
  );
  return new Map(
    rows.map((row) => [
      row.personId,
      {
        continentId: row.continentId,
        countryId: row.countryId,
        gender: row.gender,
      },
    ]),
  );
}

async function main(): Promise<void> {
  const logger = createWorkerLogger({
    name: "live-results-poller",
    filePath:
      process.env.LIVE_RESULTS_POLLER_LOG_FILE ??
      "logs/live-results-poller.log",
  });
  let connection: Connection | undefined;
  try {
    const databaseConnection = await mysql.createConnection(databaseOptions());
    connection = databaseConnection;
    logger.info("Live results poller started.", {
      pollIntervalMs: POLL_MS,
      selectedCompetition: selectedCompetition || undefined,
    });
    let reconciledDay = "";
    let lastHeartbeatAt = 0;
    let lastSettingsRefreshAt = 0;
    let loggedShutdownSignal = false;
    const stopIfRequested = () => {
      if (!shutdownSignal) return false;
      if (!loggedShutdownSignal) {
        logger.info(`Live results poller received ${shutdownSignal}.`);
        loggedShutdownSignal = true;
      }
      return true;
    };
    async function heartbeat(force = false): Promise<void> {
      const now = Date.now();
      if (!force && now - lastHeartbeatAt < HEARTBEAT_INTERVAL_MS) return;
      try {
        await recordWorkerHeartbeat(databaseConnection, {
          workerName: "live-results-poller",
          timeoutSeconds: HEARTBEAT_TIMEOUT_SECONDS,
          details: {
            mode: selectedCompetition ? "manual" : once ? "once" : "scheduled",
            pollIntervalMs: POLL_MS,
          },
        });
        lastHeartbeatAt = now;
      } catch (error) {
        logger.error("Live results poller heartbeat failed.", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        throw error;
      }
    }
    async function reconcileForToday(): Promise<void> {
      const day = utcDay();
      if (day === reconciledDay) return;
      await reconcileActiveSources(databaseConnection, logger);
      reconciledDay = day;
      await logActiveSources(databaseConnection, logger);
    }
    async function refreshPollingSettings(): Promise<void> {
      const now = Date.now();
      if (now - lastSettingsRefreshAt < SETTINGS_REFRESH_INTERVAL_MS) return;
      await applyPollingSettings(databaseConnection, logger);
      lastSettingsRefreshAt = now;
    }

    await reconcileForToday();
    await refreshPollingSettings();
    await heartbeat(true);
    do {
      if (stopIfRequested()) return;
      await heartbeat();
      await reconcileForToday();
      await refreshPollingSettings();
      const source = await claimSource(databaseConnection, logger);
      if (source) {
        try {
          await saveSnapshot(databaseConnection, source, logger);
        } catch (error) {
          logger.error(
            `Live poll failed: ${source.source_name}:${source.competition_id}.`,
            {
              sourceName: source.source_name,
              competitionId: source.competition_id,
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
            },
          );
        }
      }
      if (once || selectedCompetition) return;
      if (!source)
        await Promise.race([
          new Promise((resolve) => setTimeout(resolve, POLL_MS)),
          shutdownRequested,
        ]);
    } while (true);
  } catch (error) {
    logger.error("Live results poller stopped unexpectedly.", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  } finally {
    await connection?.end();
    await closeProjectionJobQueue();
    logger.info("Live results poller stopped.");
    await closeWorkerLogger(logger);
  }
}

async function logActiveSources(
  connection: Connection,
  logger: WorkerLogger,
): Promise<void> {
  const [sources] = await connection.query<RowDataPacket[]>(
    `SELECT source_name, competition_id, next_poll_at
     FROM provisional_live_result_sources
     WHERE enabled = 1
     ORDER BY competition_id`,
  );
  logger.info(`Active live sources: ${sources.length}.`, {
    sources: sources.map((source) => ({
      sourceName: source.source_name,
      competitionId: source.competition_id,
      nextPollAt: source.next_poll_at,
    })),
  });
}

main().catch(() => {
  process.exitCode = 1;
});
