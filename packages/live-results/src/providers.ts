import { createHash } from "node:crypto";
import type {
  LiveResult,
  LiveResultsSnapshot,
  LiveResultSource,
} from "./types.ts";

const WCA_LIVE_BASE_URL = "https://live.worldcubeassociation.org";
const CUBING_CHINA_BASE_URL = "https://cubing.com";
const FETCH_TIMEOUT_MS = 30_000;

type JsonObject = Record<string, unknown>;

export class LiveResultsNotPublishedError extends Error {
  constructor() {
    super("Results not published yet.");
    this.name = "LiveResultsNotPublishedError";
  }
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asInteger(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) ? number : null;
}

function unwrap(value: unknown): unknown {
  return isObject(value) && "data" in value ? value.data : value;
}

async function fetchJson(
  url: string,
  { resultsNotPublishedOn404 = false } = {},
): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "wcarankings-live-results-worker/1.0",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (response.status === 404 && resultsNotPublishedOn404)
    throw new LiveResultsNotPublishedError();
  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

function requiredString(value: unknown, description: string): string {
  const string = asString(value);
  if (!string) throw new Error(`Live result is missing ${description}.`);
  return string;
}

function resultFromWcaLive(
  eventId: string,
  roundNumber: number,
  row: JsonObject,
): LiveResult {
  const personId = requiredString(row.wcaId, "person WCA ID").toUpperCase();
  return {
    sourceResultId: `${eventId}:${roundNumber}:${personId}`,
    eventId,
    roundNumber,
    roundTypeId: String(roundNumber),
    formatId: null,
    personId,
    personName: requiredString(row.name, "person name"),
    countryIso2: asString(row.country)?.toUpperCase() ?? null,
    best: asInteger(row.best) ?? 0,
    average: asInteger(row.average) ?? 0,
    position: asInteger(row.ranking) ?? 0,
    attempts: Array.isArray(row.attempts)
      ? row.attempts.map((attempt) => asInteger(attempt) ?? 0)
      : [],
  };
}

export function normalizeWcaLiveResults(payload: unknown): LiveResultsSnapshot {
  if (
    !isObject(payload) ||
    !Array.isArray(payload.events) ||
    !Array.isArray(payload.persons)
  ) {
    throw new Error("Unexpected WCA Live public results response.");
  }
  const people = new Map<number, JsonObject>();
  for (const person of payload.persons) {
    if (!isObject(person)) continue;
    const id = asInteger(person.id);
    if (id !== null) people.set(id, person);
  }
  const results: LiveResult[] = [];
  for (const event of payload.events) {
    if (!isObject(event)) continue;
    const eventId = requiredString(event.eventId, "eventId");
    if (!Array.isArray(event.rounds)) continue;
    for (const round of event.rounds) {
      if (!isObject(round)) continue;
      const roundNumber = asInteger(round.number);
      if (roundNumber === null || !Array.isArray(round.results)) continue;
      for (const result of round.results) {
        if (!isObject(result)) continue;
        const registrantId = asInteger(result.personId);
        const person =
          registrantId === null ? undefined : people.get(registrantId);
        if (!person || !asString(person.wcaId)) continue;
        results.push(
          resultFromWcaLive(eventId, roundNumber, { ...result, ...person }),
        );
      }
    }
  }
  for (const eventId of new Set(results.map((result) => result.eventId))) {
    const eventResults = results.filter((result) => result.eventId === eventId);
    const finalRound = Math.max(
      ...eventResults.map((result) => result.roundNumber),
    );
    for (const result of eventResults)
      result.roundTypeId =
        result.roundNumber === finalRound ? "f" : String(result.roundNumber);
  }
  return { results };
}

function normalizeCubingChinaResult(row: unknown): LiveResult | null {
  if (!isObject(row)) return null;
  const eventId = asString(row.eventId);
  const roundId = asString(row.roundId);
  const personId = asString(row.wcaId)?.toUpperCase();
  const sourceResultId = asString(row.resultId);
  if (!eventId || !roundId || !personId || !sourceResultId) return null;
  return {
    sourceResultId,
    eventId,
    roundNumber: Number(roundId.match(/(?:^|\D)r(\d+)$/i)?.[1]) || 1,
    roundTypeId: roundId,
    formatId: asString(row.formatId),
    personId,
    personName: requiredString(row.name, "person name"),
    countryIso2: null,
    best: asInteger(row.best) ?? 0,
    average: asInteger(row.average) ?? 0,
    position: asInteger(row.place) ?? 0,
    attempts: Array.isArray(row.attempts)
      ? row.attempts.map((attempt) => asInteger(attempt) ?? 0)
      : [],
  };
}

export function normalizeCubingChinaResults(
  payload: unknown,
): LiveResultsSnapshot {
  const data = unwrap(payload);
  if (!isObject(data) || !Array.isArray(data.results))
    throw new Error("Unexpected Cubing China live results response.");
  const results = data.results
    .map(normalizeCubingChinaResult)
    .filter((row): row is LiveResult => row !== null);
  for (const eventId of new Set(results.map((result) => result.eventId))) {
    const eventResults = results.filter((result) => result.eventId === eventId);
    const finalRound = Math.max(
      ...eventResults.map((result) => result.roundNumber),
    );
    for (const result of eventResults)
      result.roundTypeId =
        result.roundNumber === finalRound ? "f" : String(result.roundNumber);
  }
  return { results };
}

export function canonicalSnapshot(snapshot: LiveResultsSnapshot): string {
  return JSON.stringify(
    [...snapshot.results].sort((left, right) =>
      left.sourceResultId.localeCompare(right.sourceResultId),
    ),
  );
}

export function snapshotHash(snapshot: LiveResultsSnapshot): string {
  return createHash("sha256").update(canonicalSnapshot(snapshot)).digest("hex");
}

async function fetchCubingChinaResults(
  remoteCompetitionId: string,
): Promise<LiveResultsSnapshot> {
  const alias = encodeURIComponent(remoteCompetitionId);
  const endpointCandidates = [
    `${CUBING_CHINA_BASE_URL}/api/v0/competition/competitors?alias=${alias}`,
    `${CUBING_CHINA_BASE_URL}/api/v0/competition/${alias}/competitors`,
    `${CUBING_CHINA_BASE_URL}/api/v0/competition/wcif?alias=${alias}`,
    `${CUBING_CHINA_BASE_URL}/api/v0/competition/${alias}/wcif`,
  ];
  let competitors: unknown[] | null = null;
  for (const endpoint of endpointCandidates) {
    try {
      const payload = unwrap(await fetchJson(endpoint));
      if (Array.isArray(payload)) {
        competitors = payload;
        break;
      }
      if (isObject(payload) && Array.isArray(payload.persons)) {
        competitors = payload.persons.filter(
          (person) =>
            isObject(person) &&
            (!isObject(person.registration) ||
              person.registration.status === "accepted"),
        );
        break;
      }
    } catch {
      // Try the next public endpoint. Cubing China varies these routes.
    }
  }
  if (!competitors?.length)
    throw new Error("Cubing China returned no accepted competitors.");
  const fetchOne = async (competitor: unknown): Promise<JsonObject[]> => {
    if (!isObject(competitor)) return [];
    const user = isObject(competitor.user) ? competitor.user : competitor;
    const number =
      asInteger(competitor.number) ??
      asInteger(competitor.registrantId) ??
      asInteger(user.registrantId);
    if (number === null) return [];
    const wcaId = asString(user.wcaId) ?? asString(user.wcaid) ?? "";
    const params = new URLSearchParams({
      "user[number]": String(number),
      "user[wcaid]": wcaId,
    });
    const payload = unwrap(
      await fetchJson(
        `${CUBING_CHINA_BASE_URL}/live/${alias}/userResults?${params}`,
      ),
    );
    if (!Array.isArray(payload)) return [];
    return payload
      .filter((row) => isObject(row) && row.t === "r")
      .map((row) => ({
        resultId: row.i,
        eventId: row.e,
        roundId: row.r,
        formatId: row.f,
        best: row.b,
        average: row.a,
        attempts: row.v,
        wcaId,
        name: user.name,
      }));
  };
  const rows: JsonObject[][] = [];
  for (let index = 0; index < competitors.length; index += 8) {
    rows.push(
      ...(await Promise.all(competitors.slice(index, index + 8).map(fetchOne))),
    );
  }
  return normalizeCubingChinaResults({ results: rows.flat() });
}

export async function fetchLiveResults(
  source: LiveResultSource,
  remoteCompetitionId: string,
): Promise<LiveResultsSnapshot> {
  if (source === "wca-live") {
    return normalizeWcaLiveResults(
      await fetchJson(
        `${WCA_LIVE_BASE_URL}/api/competitions/${encodeURIComponent(remoteCompetitionId)}/results`,
        { resultsNotPublishedOn404: true },
      ),
    );
  }
  return fetchCubingChinaResults(remoteCompetitionId);
}
