import { query } from "@/db";
import { getRecordBadges } from "@/lib/wca";
import {
  allTimeOfficialResultPageQuery,
  allTimeOfficialResultPageValues,
  allTimeOfficialResultTotalQuery,
  allTimeOfficialResultTotalValues,
  currentYearLiveResultRankingValues,
  currentYearLiveResultRankingsQuery,
  liveResultCandidatesQuery,
  liveResultCandidatesValues,
} from "./queries/live-result-overlay";
import type {
  ResultRankingLoadResult,
  ResultRankingRequest,
} from "./result-types";
import type { ResultRankingRow } from "./types";

export async function loadCurrentYearLiveResultOverlay(
  input: ResultRankingRequest,
): Promise<ResultRankingLoadResult> {
  const result = await query<ResultRankingRow>(
    currentYearLiveResultRankingsQuery(input),
    currentYearLiveResultRankingValues(input),
  );
  const pageRows = result.rows.slice(0, input.limit);
  const last = pageRows.at(-1);
  return {
    data: {
      entries: pageRows.map((row) => ({
        entryKey: `result:${input.resultType}:${row.result_id}:${row.attempt_number ?? 0}`,
        resultId: Number(row.result_id),
        rank: Number(row.rank),
        subRank: Number(row.position),
        personId: row.person_id,
        personName: row.person_name,
        countryId: row.country_id,
        countryName: row.country_name,
        countryIso2: row.country_iso2,
        continentId: row.continent_id,
        best: Number(row.result_value),
        competitionId: row.competition_id,
        competitionName: row.competition_name,
        recordBadges: recordBadges(input, row),
      })),
      hasMore: result.rows.length > input.limit,
      nextPageStart:
        result.rows.length > input.limit && last ? Number(last.position) : null,
      previousPageStart:
        input.start > 0 ? Math.max(0, input.start - input.limit) : null,
      startPosition: Number(pageRows[0]?.position ?? input.start + 1) - 1,
      lastRank: last ? Number(last.rank) : null,
      total: Number(result.rows[0]?.total_count ?? 0),
    },
    diagnostics: {
      timings: result.timings,
      queryCount: 1,
      returnedRows: result.rows.length,
      cacheOutcome: "bypass",
      cacheLayer: "memory",
    },
  };
}

export async function loadAllTimeLiveResultOverlay(
  input: ResultRankingRequest,
): Promise<ResultRankingLoadResult> {
  const [live, total] = await Promise.all([
    query<ResultRankingRow>(
      liveResultCandidatesQuery(input),
      liveResultCandidatesValues(input),
    ),
    query<{ total_count: number }>(
      allTimeOfficialResultTotalQuery(input),
      allTimeOfficialResultTotalValues(input),
    ),
  ]);
  const officialStart = Math.max(0, input.start - live.rows.length);
  const official = await query<ResultRankingRow>(
    allTimeOfficialResultPageQuery(input),
    allTimeOfficialResultPageValues(
      input,
      officialStart,
      input.limit + live.rows.length + 1,
    ),
  );
  const rows = mergeAllTimeRows(
    input,
    official.rows,
    live.rows,
    Number(total.rows[0]?.total_count ?? 0),
  );
  const pageRows = rows.slice(0, input.limit);
  const last = pageRows.at(-1);
  return {
    data: {
      entries: pageRows.map((row) => ({
        entryKey: `result:${input.resultType}:${row.result_id}:${row.attempt_number ?? 0}`,
        resultId: Number(row.result_id),
        rank: Number(row.rank),
        subRank: Number(row.position),
        personId: row.person_id,
        personName: row.person_name,
        countryId: row.country_id,
        countryName: row.country_name,
        countryIso2: row.country_iso2,
        continentId: row.continent_id,
        best: Number(row.result_value),
        competitionId: row.competition_id,
        competitionName: row.competition_name,
        recordBadges: recordBadges(input, row),
      })),
      hasMore: rows.length > input.limit,
      nextPageStart:
        rows.length > input.limit && last ? Number(last.position) : null,
      previousPageStart:
        input.start > 0 ? Math.max(0, input.start - input.limit) : null,
      startPosition: Number(pageRows[0]?.position ?? input.start + 1) - 1,
      lastRank: last ? Number(last.rank) : null,
      total: Number(total.rows[0]?.total_count ?? 0) + live.rows.length,
    },
    diagnostics: {
      timings: {
        queueMs:
          live.timings.queueMs +
          total.timings.queueMs +
          official.timings.queueMs,
        statementMs:
          live.timings.statementMs +
          total.timings.statementMs +
          official.timings.statementMs,
      },
      queryCount: 3,
      returnedRows: live.rows.length + total.rows.length + official.rows.length,
      cacheOutcome: "bypass",
      cacheLayer: "memory",
    },
  };
}

function mergeAllTimeRows(
  input: ResultRankingRequest,
  officialRows: ResultRankingRow[],
  liveRows: ResultRankingRow[],
  officialTotal: number,
) {
  const boundary = officialRows.at(-1);
  const relevantLiveRows = boundary
    ? liveRows.filter((row) => compareResultRows(input, row, boundary) <= 0)
    : liveRows;
  const positionedLiveRows = relevantLiveRows.map((row) => {
    const successor = officialRows.find(
      (official) => compareResultRows(input, official, row) >= 0,
    );
    const earlierLiveRows = liveRows.filter(
      (other) => compareResultRows(input, other, row) < 0,
    );
    return {
      ...row,
      rank:
        Number(successor?.rank ?? officialTotal + 1) +
        liveRows.filter((other) => other.result_value < row.result_value)
          .length,
      position:
        Number(successor?.position ?? officialTotal + 1) +
        earlierLiveRows.length,
    };
  });
  const positionedOfficialRows = officialRows.map((row) => ({
    ...row,
    rank:
      Number(row.rank) +
      liveRows.filter((live) => live.result_value < row.result_value).length,
    position:
      Number(row.position) +
      liveRows.filter((live) => compareResultRows(input, live, row) < 0).length,
  }));
  return [...positionedOfficialRows, ...positionedLiveRows]
    .sort((left, right) => Number(left.position) - Number(right.position))
    .filter((row) => Number(row.position) > input.start)
    .slice(0, input.limit + 1);
}

function compareResultRows(
  input: ResultRankingRequest,
  left: ResultRankingRow,
  right: ResultRankingRow,
) {
  if (left.result_value !== right.result_value)
    return left.result_value - right.result_value;
  if (input.resultType === "average") return left.result_id - right.result_id;
  const leftDate = String(
    (left as ResultRankingRow & { competition_start_date?: string })
      .competition_start_date ?? "",
  );
  const rightDate = String(
    (right as ResultRankingRow & { competition_start_date?: string })
      .competition_start_date ?? "",
  );
  return (
    leftDate.localeCompare(rightDate) ||
    left.competition_id.localeCompare(right.competition_id) ||
    left.result_id - right.result_id ||
    Number(left.attempt_number ?? 0) - Number(right.attempt_number ?? 0)
  );
}

function recordBadges(input: ResultRankingRequest, row: ResultRankingRow) {
  const isWorldRecord = row.record_code === "WR";
  const isContinentRecord = row.record_code === "CR";
  const isCountryRecord = row.record_code === "NR";
  if (input.scope === "world") {
    return getRecordBadges({
      isWorldRecord,
      isContinentRecord,
      isCountryRecord,
      continentId: row.continent_id,
    });
  }
  return getRecordBadges({
    isWorldRecord: false,
    isContinentRecord: input.scope === "continent" && Number(row.rank) === 1,
    isCountryRecord: input.scope === "country" && Number(row.rank) === 1,
    continentId: row.continent_id,
  });
}
