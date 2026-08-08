import { randomUUID } from "node:crypto";
import mysql from "mysql2/promise";
import type {
  Connection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import { argumentPresent, argumentValue } from "@wcarankings/cli";
import { databaseOptions } from "@wcarankings/database";
import {
  closeProjectionJobQueue,
  enqueueProjectionJob,
  type ProjectionJobEnqueueOutcome,
  type ProjectionJob,
} from "@wcarankings/projection-jobs";
import {
  closeWorkerLogger,
  createWorkerLogger,
  type WorkerLogger,
} from "@wcarankings/worker-logging";
import {
  createWorkerHealthServer,
  type WorkerHealthServer,
} from "@wcarankings/worker-health";
import {
  fetchLiveResults,
  fetchWcaCompetitionRegistrationCount,
  fetchWcaCompetitionMetadata,
  LiveResultsNotPublishedError,
  liveResultRoundKey,
  roundSnapshotHashes,
  snapshotHash,
} from "@wcarankings/live-results";
import type {
  LiveResultSource,
  LiveResultsSnapshot,
  LiveResultsSourceRow,
} from "@wcarankings/live-results";
import {
  mergeProjectionJobs,
  partitionJobs,
  type CountryRegion,
  type PersonRegion,
  type SnapshotResultIdentity,
} from "./job-partitions.ts";
import { enrichSnapshotPeople } from "./live-people.ts";

const POLL_MS = Math.max(
  60_000,
  Number(process.env.PROVISIONAL_RANKING_WORKER_POLL_MS) || 60_000,
);
const LEASE_SECONDS = Math.max(
  30,
  Number(process.env.PROVISIONAL_RANKING_WORKER_LEASE_SECONDS) || 120,
);
const DEFAULT_HEALTH_PORT = 3011;
const selectedCompetition = argumentValue("competition");
const once = argumentPresent("once");
type StoredSnapshotResultIdentity = Omit<SnapshotResultIdentity, "attempts"> & {
  attemptsJson: unknown;
};
type SnapshotQueueWork = {
  hash: string;
  previousResults: SnapshotResultIdentity[];
  snapshot: LiveResultsSnapshot;
  source: LiveResultsSourceRow;
};
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

function isRetryableDatabaseLockError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "ER_LOCK_WAIT_TIMEOUT" || code === "ER_LOCK_DEADLOCK";
}

async function retryDatabaseOperation<T>(
  operation: () => Promise<T>,
  logger: WorkerLogger,
  label: string,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableDatabaseLockError(error) || attempt >= 5) throw error;
      logger.warn(`${label} hit a database lock; retrying.`, {
        attempt,
        error: error instanceof Error ? error.message : String(error),
      });
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
}

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
  countryIso2: string;
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

function cubingChinaAlias(website: string | null): string | null {
  if (!website) return null;
  try {
    const url = new URL(website);
    if (
      url.hostname !== "cubing.com" &&
      url.hostname !== "cubingchina.com" &&
      url.hostname !== "www.cubingchina.com"
    )
      return null;
    const [, collection, alias] = url.pathname.split("/");
    return collection === "competition" && alias
      ? decodeURIComponent(alias)
      : null;
  } catch {
    return null;
  }
}

function providerCompatibility(
  competition: ActiveCompetition,
  scoretakingSoftware: string | null,
  website: string | null,
): {
  enabled: number;
  status: ProviderStatus;
  message: string | null;
  remoteCompetitionId: string;
  sourceName: LiveResultSource;
} {
  if (scoretakingSoftware === "wca_live")
    return {
      enabled: 1,
      status: "supported",
      message: null,
      remoteCompetitionId: competition.id,
      sourceName: "wca-live",
    };
  if (scoretakingSoftware === "internal")
    return {
      enabled: 1,
      status: "supported",
      message: null,
      remoteCompetitionId: competition.id,
      sourceName: "ilr",
    };
  if (competition.countryIso2 === "CN" && scoretakingSoftware === "external")
    return {
      enabled: 1,
      status: "supported",
      message: null,
      remoteCompetitionId: cubingChinaAlias(website) ?? competition.id,
      sourceName: "cubing-china",
    };
  if (!scoretakingSoftware)
    return {
      enabled: 0,
      status: "unknown",
      message: "WCA did not report scoretaking software.",
      remoteCompetitionId: competition.id,
      sourceName: "unknown",
    };
  return {
    enabled: 0,
    status: "unsupported",
    message: `Unsupported scoretaking software: ${scoretakingSoftware}`,
    remoteCompetitionId: competition.id,
    sourceName: "unknown",
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
    `SELECT competition.id, competition.year, COALESCE(country.iso2, '') AS countryIso2
     FROM competitions competition
     LEFT JOIN countries country ON country.id = competition.country_id
     WHERE ${activeCompetitionPredicate}`,
  );
  const discovered = await Promise.all(
    activeCompetitions.map(async (competition) => {
      try {
        const { scoretakingSoftware, website } =
          await fetchWcaCompetitionMetadata(competition.id);
        const registeredPersonCount =
          await fetchWcaCompetitionRegistrationCount(competition.id).catch(
            (error) => {
              logger.warn(
                `Could not fetch registrations for ${competition.id}.`,
                {
                  competitionId: competition.id,
                  error: error instanceof Error ? error.message : String(error),
                },
              );
              return null;
            },
          );
        return {
          ...competition,
          scoretakingSoftware,
          registeredPersonCount,
          metadataAvailable: true,
          ...providerCompatibility(competition, scoretakingSoftware, website),
        };
      } catch {
        return {
          ...competition,
          scoretakingSoftware: null,
          registeredPersonCount: null,
          metadataAvailable: false,
          enabled: 0,
          status: "unknown" as const,
          message: "WCA scoretaking software is unavailable.",
          remoteCompetitionId: competition.id,
          sourceName: "unknown" as const,
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
    for (const competition of discovered) {
      await connection.query(
        `UPDATE provisional_live_result_sources
         SET enabled = 0, lease_token = NULL, leased_until = NULL
         WHERE competition_id = ? AND source_name <> ?`,
        [competition.id, competition.sourceName],
      );
      await connection.query(
        `UPDATE provisional_live_result_sources
         SET remote_competition_id = ?,
             scoretaking_software = IF(? = 1, ?, scoretaking_software),
             provider_status = ?, provider_message = ?,
             registered_person_count = COALESCE(?, registered_person_count),
             next_poll_at = IF(? = 1 AND enabled = 0 AND ? = 1, CURRENT_TIMESTAMP(6), next_poll_at),
             enabled = IF(? = 1, ?, enabled)
         WHERE source_name = ? AND competition_id = ?`,
        [
          competition.remoteCompetitionId,
          competition.metadataAvailable ? 1 : 0,
          competition.scoretakingSoftware,
          competition.status,
          competition.message,
          competition.registeredPersonCount,
          competition.metadataAvailable ? 1 : 0,
          competition.enabled,
          competition.metadataAvailable ? 1 : 0,
          competition.enabled,
          competition.sourceName,
          competition.id,
        ],
      );
      await connection.query(
        `INSERT INTO provisional_live_result_sources
           (source_name, competition_id, remote_competition_id, competition_year, enabled, scoretaking_software, provider_status, provider_message, registered_person_count)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM provisional_live_result_sources source
           WHERE source.source_name = ? AND source.competition_id = ?
         )`,
        [
          competition.sourceName,
          competition.id,
          competition.remoteCompetitionId,
          competition.year,
          competition.enabled,
          competition.scoretakingSoftware,
          competition.status,
          competition.message,
          competition.registeredPersonCount,
          competition.sourceName,
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

async function claimSources(
  connection: Connection,
  logger: WorkerLogger,
): Promise<LiveResultsSourceRow[]> {
  const startedAt = performance.now();
  const token = randomUUID();
  await connection.beginTransaction();
  try {
    if (!selectedCompetition) {
      const [scheduled] = await connection.query<ResultSetHeader>(
        `UPDATE live_results_settings
         SET next_import_at = DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL poll_seconds SECOND)
         WHERE id = 1 AND next_import_at <= CURRENT_TIMESTAMP(6)`,
      );
      if (scheduled.affectedRows === 0) {
        await connection.commit();
        logger.debug("The next live import is not due.", {
          durationMs: Math.round(performance.now() - startedAt),
        });
        return [];
      }
    }
    const [rows] = await connection.query<
      (LiveResultsSourceRow & RowDataPacket)[]
    >(
      `SELECT source_name, competition_id, remote_competition_id, competition_year
       FROM provisional_live_result_sources
       WHERE enabled = 1 AND (? = '' OR competition_id = ?)
         AND (leased_until IS NULL OR leased_until < CURRENT_TIMESTAMP(6))
       ORDER BY competition_id FOR UPDATE SKIP LOCKED`,
      [selectedCompetition, selectedCompetition],
    );
    if (rows.length === 0) {
      await connection.commit();
      logger.debug("No live source is due.", {
        durationMs: Math.round(performance.now() - startedAt),
      });
      return [];
    }
    for (const source of rows)
      await connection.query(
        `UPDATE provisional_live_result_sources SET lease_token = ?,
         leased_until = DATE_ADD(CURRENT_TIMESTAMP(6), INTERVAL ? SECOND)
         WHERE source_name = ? AND competition_id = ?`,
        [token, LEASE_SECONDS, source.source_name, source.competition_id],
      );
    await connection.commit();
    logger.debug(`Claimed ${rows.length} live sources.`, {
      sourceCount: rows.length,
      leaseSeconds: LEASE_SECONDS,
      durationMs: Math.round(performance.now() - startedAt),
    });
    return rows.map((source) => ({
      ...source,
      competition_year: Number(source.competition_year),
      lease_token: token,
    }));
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function saveSnapshot(
  connection: Connection,
  source: LiveResultsSourceRow,
  logger: WorkerLogger,
): Promise<SnapshotQueueWork | null> {
  const startedAt = performance.now();
  const fetchStartedAt = performance.now();
  let snapshot: LiveResultsSnapshot | undefined;
  let fetchDurationMs = 0;
  let hash: string;
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
    const providerSnapshot = await fetchLiveResults(
      source.source_name,
      source.remote_competition_id,
    );
    snapshot = await enrichSnapshotPeople(connection, providerSnapshot);
    fetchDurationMs = Math.round(performance.now() - fetchStartedAt);
    if (snapshot.skippedRoundIds?.length)
      logger.warn("Skipped unsupported ILR H2H rounds.", {
        sourceName: source.source_name,
        competitionId: source.competition_id,
        roundIds: snapshot.skippedRoundIds,
      });
    hash = snapshotHash(snapshot);
    const incomingRounds = snapshotRounds(snapshot);
    logger.debug("Fetched live results.", {
      sourceName: source.source_name,
      competitionId: source.competition_id,
      resultCount: snapshot.results.length,
      skippedUnknownPersonCount:
        providerSnapshot.results.length - snapshot.results.length,
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
          (StoredSnapshotResultIdentity & RowDataPacket)[]
        >(
          `SELECT source_result_id AS sourceResultId, person_id AS personId,
            event_id AS eventId, country_iso2 AS countryIso2, best, average,
            attempts_json AS attemptsJson
           FROM provisional_live_results
           WHERE source_name = ? AND competition_id = ?`,
          [source.source_name, source.competition_id],
        );
        previousResults = rows.map(snapshotResultIdentityFromRow);
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
          (StoredSnapshotResultIdentity & RowDataPacket)[]
        >(
          `SELECT source_result_id AS sourceResultId, person_id AS personId,
            event_id AS eventId, country_iso2 AS countryIso2, best, average,
            attempts_json AS attemptsJson
           FROM provisional_live_results
           WHERE source_name = ? AND competition_id = ? AND (${predicate})`,
          [source.source_name, source.competition_id, ...parameters],
        );
        previousResults = rows.map(snapshotResultIdentityFromRow);
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
       lease_token = NULL, leased_until = NULL
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
         last_error = ?
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
      return null;
    }
    await connection.query(
      `UPDATE provisional_live_result_sources SET lease_token = NULL, leased_until = NULL,
      last_error = ?
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
  if (!needsQueue) return null;
  if (!snapshot) throw new Error("Live result snapshot is missing.");
  return {
    hash,
    previousResults,
    snapshot: changedSnapshot ?? snapshot,
    source,
  };
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

async function queueSnapshotWorks(
  connection: Connection,
  works: readonly SnapshotQueueWork[],
  logger: WorkerLogger,
): Promise<void> {
  if (works.length === 0) return;
  const sourceVersion = await currentSourceVersion(connection);
  const partitionedJobs: ProjectionJob[] = [];
  for (const work of works) {
    const resultsForJobs = [
      ...work.previousResults,
      ...work.snapshot.results.map((result) => ({
        average: result.average,
        attempts: result.attempts,
        best: result.best,
        countryIso2: result.countryIso2,
        eventId: result.eventId,
        personId: result.personId,
        sourceResultId: result.sourceResultId,
      })),
    ];
    const [countryRegionsByIso2, personRegionsById] = await Promise.all([
      countryRegionsFor(connection, resultsForJobs),
      personRegionsFor(connection, resultsForJobs),
    ]);
    partitionedJobs.push(
      ...partitionJobs(
        work.source,
        work.snapshot,
        sourceVersion,
        work.previousResults,
        countryRegionsByIso2,
        personRegionsById,
      ),
    );
  }
  const jobs = mergeProjectionJobs(partitionedJobs);
  const startedAt = performance.now();
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
        sourceVersion,
        job,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }
  for (const work of works)
    await connection.query(
      `UPDATE provisional_live_result_sources SET queued_snapshot_hash = ?
       WHERE source_name = ? AND competition_id = ? AND snapshot_hash = ?`,
      [
        work.hash,
        work.source.source_name,
        work.source.competition_id,
        work.hash,
      ],
    );
  logger.info(
    `Queued ${jobs.length} projection rebuilds for ${works.length} live imports.`,
    {
      sourceVersion,
      importCount: works.length,
      jobCount: jobs.length,
      partitionedJobCount: partitionedJobs.length,
      outcomes,
      durationMs: Math.round(performance.now() - startedAt),
    },
  );
}

function snapshotResultIdentityFromRow(
  row: StoredSnapshotResultIdentity,
): SnapshotResultIdentity {
  return {
    average: Number(row.average),
    attempts: parseStoredAttempts(row.attemptsJson),
    best: Number(row.best),
    countryIso2: row.countryIso2,
    eventId: row.eventId,
    personId: row.personId,
    sourceResultId: row.sourceResultId,
  };
}

function parseStoredAttempts(value: unknown): number[] {
  const parsed =
    typeof value === "string"
      ? JSON.parse(value)
      : Array.isArray(value)
        ? value
        : [];
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (attempt): attempt is number =>
      typeof attempt === "number" && Number.isSafeInteger(attempt),
  );
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
  let healthServer: WorkerHealthServer | undefined;
  try {
    healthServer = await createWorkerHealthServer({
      port:
        Number(process.env.LIVE_RESULTS_POLLER_HEALTH_PORT) ||
        DEFAULT_HEALTH_PORT,
      workerName: "live-results-poller",
      onRestart: () => {
        process.kill(process.pid, "SIGTERM");
      },
    });
    const databaseConnection = await mysql.createConnection(databaseOptions());
    connection = databaseConnection;
    await databaseConnection.query("SET SESSION innodb_lock_wait_timeout = 5");
    logger.info("Live results poller started.", {
      pollIntervalMs: POLL_MS,
      selectedCompetition: selectedCompetition || undefined,
    });
    let reconciledDay = "";
    let loggedShutdownSignal = false;
    const stopIfRequested = () => {
      if (!shutdownSignal) return false;
      if (!loggedShutdownSignal) {
        logger.info(`Live results poller received ${shutdownSignal}.`);
        loggedShutdownSignal = true;
      }
      return true;
    };
    async function reconcileForToday(): Promise<void> {
      const day = utcDay();
      if (day === reconciledDay) return;
      await retryDatabaseOperation(
        () => reconcileActiveSources(databaseConnection, logger),
        logger,
        "Active source reconciliation",
      );
      reconciledDay = day;
      await logActiveSources(databaseConnection, logger);
    }
    if (!selectedCompetition) await reconcileForToday();
    healthServer.setState("ready");
    do {
      if (stopIfRequested()) return;
      if (!selectedCompetition) await reconcileForToday();
      const sources = await claimSources(databaseConnection, logger);
      const queueWorks: SnapshotQueueWork[] = [];
      for (const source of sources) {
        try {
          const work = await saveSnapshot(databaseConnection, source, logger);
          if (work) queueWorks.push(work);
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
      try {
        await queueSnapshotWorks(databaseConnection, queueWorks, logger);
      } catch (error) {
        logger.error("Projection enqueue batch failed.", {
          importCount: queueWorks.length,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
      if (once || selectedCompetition) return;
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
    await healthServer?.close().catch(() => undefined);
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
    `SELECT source_name, competition_id
     FROM provisional_live_result_sources
     WHERE enabled = 1
     ORDER BY competition_id`,
  );
  const [settings] = await connection.query<RowDataPacket[]>(
    "SELECT next_import_at FROM live_results_settings WHERE id = 1",
  );
  logger.info(`Active live sources: ${sources.length}.`, {
    nextImportAt: settings[0]?.next_import_at,
    sources: sources.map((source) => ({
      sourceName: source.source_name,
      competitionId: source.competition_id,
    })),
  });
}

main().catch(() => {
  process.exitCode = 1;
});
