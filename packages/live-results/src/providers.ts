import { createHash } from "node:crypto";
import type {
  LiveResult,
  LiveResultsSnapshot,
  LiveResultSource,
} from "./types.ts";

const WCA_LIVE_BASE_URL = "https://live.worldcubeassociation.org";
const CUBING_CHINA_BASE_URL = "https://cubing.com";
const FETCH_TIMEOUT_MS = 30_000;
const WCA_FETCH_ATTEMPTS = 3;
const WCA_RETRY_DELAY_MS = 250;
const WCA_COMPETITION_API_URL =
  "https://www.worldcubeassociation.org/api/v0/competitions";
const WCA_ILR_API_URL =
  "https://www.worldcubeassociation.org/api/v1/competitions";

type JsonObject = Record<string, unknown>;

export type WcaCompetitionMetadata = {
  scoretakingSoftware: string | null;
  website: string | null;
};

export async function fetchWcaCompetitionMetadata(
  competitionId: string,
): Promise<WcaCompetitionMetadata> {
  const payload = await fetchJson(
    `${WCA_COMPETITION_API_URL}/${encodeURIComponent(competitionId)}`,
  );
  if (!isObject(payload)) return { scoretakingSoftware: null, website: null };
  return {
    scoretakingSoftware: asString(payload.scoretaking_software),
    website: asString(payload.website),
  };
}

export async function fetchWcaCompetitionRegistrationCount(
  competitionId: string,
): Promise<number | null> {
  const payload = unwrap(
    await fetchJson(
      `${WCA_COMPETITION_API_URL}/${encodeURIComponent(competitionId)}/registrations`,
    ),
  );
  return Array.isArray(payload) ? payload.length : null;
}

export async function fetchWcaCompetitionScoretakingSoftware(
  competitionId: string,
): Promise<string | null> {
  return (await fetchWcaCompetitionMetadata(competitionId)).scoretakingSoftware;
}

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

function asIdentifier(value: unknown): string | null {
  return asString(value) ?? asInteger(value)?.toString() ?? null;
}

function unwrap(value: unknown): unknown {
  return isObject(value) && "data" in value ? value.data : value;
}

async function fetchJson(
  url: string,
  { resultsNotPublishedOn404 = false } = {},
): Promise<unknown> {
  const attempts = isWcaUrl(url) ? WCA_FETCH_ATTEMPTS : 1;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
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
    } catch (error) {
      if (!canRetryWcaFetch(error, attempt, attempts)) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, WCA_RETRY_DELAY_MS * 2 ** (attempt - 1)),
      );
    }
  }
  throw new Error(`Unable to fetch ${url}.`);
}

function isWcaUrl(url: string): boolean {
  return (
    url.startsWith(`${WCA_COMPETITION_API_URL}/`) ||
    url.startsWith(`${WCA_ILR_API_URL}/`) ||
    url.startsWith(`${WCA_LIVE_BASE_URL}/`)
  );
}

function canRetryWcaFetch(
  error: unknown,
  attempt: number,
  attempts: number,
): boolean {
  if (attempt >= attempts || error instanceof LiveResultsNotPublishedError)
    return false;
  const status = error instanceof Error ? Number(error.message.slice(0, 3)) : 0;
  return !Number.isInteger(status) || status === 429 || status >= 500;
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
  const eventId = asIdentifier(row.eventId);
  const roundId = asIdentifier(row.roundId);
  const personId = asString(row.wcaId)?.toUpperCase();
  const sourceResultId = asIdentifier(row.resultId);
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
  return canonicalResults(snapshot.results);
}

function canonicalResults(results: readonly LiveResult[]): string {
  return JSON.stringify(
    [...results].sort((left, right) =>
      left.sourceResultId.localeCompare(right.sourceResultId),
    ),
  );
}

export function liveResultRoundKey(
  result: Pick<LiveResult, "eventId" | "roundNumber">,
): string {
  return `${result.eventId}:${result.roundNumber}`;
}

export function roundSnapshotHashes(
  snapshot: LiveResultsSnapshot,
): Map<string, string> {
  const resultsByRound = new Map<string, LiveResult[]>();
  for (const result of snapshot.results) {
    const key = liveResultRoundKey(result);
    const results = resultsByRound.get(key) ?? [];
    results.push(result);
    resultsByRound.set(key, results);
  }
  return new Map(
    [...resultsByRound].map(([key, results]) => [
      key,
      createHash("sha256").update(canonicalResults(results)).digest("hex"),
    ]),
  );
}

export function snapshotHash(snapshot: LiveResultsSnapshot): string {
  const rounds = [...roundSnapshotHashes(snapshot)].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return createHash("sha256").update(JSON.stringify(rounds)).digest("hex");
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
    // Cubing China returns people as either `user`, `competitor`, or the row
    // itself. Maoming Open uses `competitor`; use one normalized identity for
    // both the request WCA ID and the stored person fields.
    const user = isObject(competitor.user)
      ? competitor.user
      : isObject(competitor.competitor)
        ? competitor.competitor
        : competitor;
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
        // Cubing China sends result identifiers and common event IDs as JSON
        // numbers. Normalize them before the generic reader validates fields.
        resultId: String(row.i),
        eventId: String(row.e),
        roundId: String(row.r),
        formatId: row.f === "" ? null : String(row.f),
        best: row.b,
        average: row.a,
        attempts: row.v,
        place: row.p,
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

type IlrPerson = {
  countryIso2: string | null;
  name: string;
  wcaId: string;
};

function wcifPeople(payload: unknown): Map<number, IlrPerson> {
  if (!isObject(payload) || !Array.isArray(payload.persons))
    throw new Error("Unexpected WCA public WCIF response.");
  const people = new Map<number, IlrPerson>();
  for (const person of payload.persons) {
    if (!isObject(person)) continue;
    const registrantId = asInteger(person.registrantId);
    const wcaId = asString(person.wcaId)?.toUpperCase();
    const name = asString(person.name);
    if (registrantId === null || !wcaId || !name) continue;
    people.set(registrantId, {
      wcaId,
      name,
      countryIso2: asString(person.countryIso2)?.toUpperCase() ?? null,
    });
  }
  return people;
}

function wcifRoundIds(payload: unknown): string[] {
  if (!isObject(payload) || !Array.isArray(payload.events))
    throw new Error("Unexpected WCA public WCIF response.");
  const ids: string[] = [];
  for (const event of payload.events) {
    if (!isObject(event) || !Array.isArray(event.rounds)) continue;
    for (const round of event.rounds) {
      if (!isObject(round)) continue;
      const id = asString(round.id);
      if (id) ids.push(id);
    }
  }
  return ids;
}

function ilrRoundNumber(roundId: string): number {
  return Number(roundId.match(/-r(\d+)$/i)?.[1]) || 1;
}

function ilrEventId(roundId: string): string {
  const eventId = roundId.match(/^(.+)-r\d+$/i)?.[1];
  if (!eventId) throw new Error(`Unexpected ILR round ID: ${roundId}.`);
  return eventId;
}

function isUnsupportedIlrRound(round: JsonObject): boolean {
  if (round.format === "h") return true;
  if (!Array.isArray(round.results) || round.results.length === 0) return false;
  return round.results.some(
    (result) =>
      isObject(result) &&
      ("match_id" in result ||
        "matchId" in result ||
        "opponent" in result ||
        "winner" in result),
  );
}

function normalizeIlrRound(
  payload: unknown,
  people: ReadonlyMap<number, IlrPerson>,
): { results: LiveResult[]; skippedRoundId: string | null } {
  if (!isObject(payload)) throw new Error("Unexpected WCA ILR round response.");
  const roundId = requiredString(payload.id, "ILR round ID");
  if (isUnsupportedIlrRound(payload))
    return { results: [], skippedRoundId: roundId };
  if (!Array.isArray(payload.results))
    throw new Error(`ILR round ${roundId} is missing results.`);
  const eventId = ilrEventId(roundId);
  const roundNumber = ilrRoundNumber(roundId);
  const formatId = asString(payload.format);
  const results: LiveResult[] = [];
  for (const row of payload.results) {
    if (!isObject(row)) continue;
    const registrantId = asInteger(row.registration_id);
    const person = registrantId === null ? undefined : people.get(registrantId);
    if (!person) continue;
    const attempts = Array.isArray(row.attempts)
      ? row.attempts.map((attempt) =>
          isObject(attempt) ? (asInteger(attempt.value) ?? 0) : 0,
        )
      : [];
    results.push({
      sourceResultId: `${roundId}:${person.wcaId}`,
      eventId,
      roundNumber,
      roundTypeId: String(roundNumber),
      formatId,
      personId: person.wcaId,
      personName: person.name,
      countryIso2: person.countryIso2,
      best: asInteger(row.best) ?? 0,
      average: asInteger(row.average) ?? 0,
      position: asInteger(row.global_pos) ?? 0,
      attempts,
    });
  }
  return { results, skippedRoundId: null };
}

export function normalizeIlrResults(
  wcif: unknown,
  roundPayloads: readonly unknown[],
): LiveResultsSnapshot {
  const people = wcifPeople(wcif);
  const results: LiveResult[] = [];
  const skippedRoundIds: string[] = [];
  for (const payload of roundPayloads) {
    const normalized = normalizeIlrRound(payload, people);
    results.push(...normalized.results);
    if (normalized.skippedRoundId)
      skippedRoundIds.push(normalized.skippedRoundId);
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
  return { results, skippedRoundIds };
}

export async function fetchIlrResults(
  competitionId: string,
): Promise<LiveResultsSnapshot> {
  const encodedCompetitionId = encodeURIComponent(competitionId);
  const wcif = await fetchJson(
    `${WCA_COMPETITION_API_URL}/${encodedCompetitionId}/wcif/public`,
  );
  const roundIds = wcifRoundIds(wcif);
  const payloads: unknown[] = [];
  for (let index = 0; index < roundIds.length; index += 8) {
    payloads.push(
      ...(await Promise.all(
        roundIds
          .slice(index, index + 8)
          .map((roundId) =>
            fetchJson(
              `${WCA_ILR_API_URL}/${encodedCompetitionId}/live/rounds/${encodeURIComponent(roundId)}`,
            ),
          ),
      )),
    );
  }
  return normalizeIlrResults(wcif, payloads);
}

export async function fetchLiveResults(
  source: LiveResultSource,
  remoteCompetitionId: string,
): Promise<LiveResultsSnapshot> {
  if (source === "unknown")
    throw new Error("An unknown live results source cannot be fetched.");
  if (source === "ilr") return fetchIlrResults(remoteCompetitionId);
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
