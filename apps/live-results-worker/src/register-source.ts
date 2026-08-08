import mysql from "mysql2/promise";
import { databaseOptions } from "@wcarankings/database";
import {
  LIVE_RESULT_SOURCES,
  type LiveResultSource,
} from "@wcarankings/live-results";

function usage(): never {
  throw new Error(
    "Usage: register-live-results-source.ts <ilr|wca-live|cubing-china> <competitionId> [remoteCompetitionId] [pollSeconds]",
  );
}

const [
  source,
  competitionId,
  remoteCompetitionId = competitionId,
  pollSeconds = "3600",
] = process.argv.slice(2);
if (
  !source ||
  !competitionId ||
  !LIVE_RESULT_SOURCES.includes(source as LiveResultSource) ||
  source === "unknown"
)
  usage();
const year = new Date().getUTCFullYear();
if (!competitionId.includes(String(year))) {
  throw new Error(
    `Only the current year (${year}) may use provisional live results.`,
  );
}
const poll = Number(pollSeconds);
if (!Number.isInteger(poll) || poll < 60 || poll > 86_400)
  throw new Error("pollSeconds must be an integer from 60 through 86400.");

const connection = await mysql.createConnection(databaseOptions());
try {
  await connection.query(
    `INSERT INTO provisional_live_result_sources
     (source_name, competition_id, remote_competition_id, competition_year, provider_status, provider_message, poll_seconds, next_poll_at)
     VALUES (?, ?, ?, ?, 'supported', NULL, ?, CURRENT_TIMESTAMP(6))
     ON DUPLICATE KEY UPDATE remote_competition_id = VALUES(remote_competition_id), enabled = 1,
       provider_status = 'supported', provider_message = NULL,
       poll_seconds = VALUES(poll_seconds), next_poll_at = CURRENT_TIMESTAMP(6), last_error = NULL`,
    [source, competitionId, remoteCompetitionId, year, poll],
  );
  process.stdout.write(
    `Registered ${source} live results for ${competitionId}.\n`,
  );
} finally {
  await connection.end();
}
