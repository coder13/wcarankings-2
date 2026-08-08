import type { Connection, RowDataPacket } from "mysql2/promise";
import type {
  LiveResult,
  LiveResultsSnapshot,
} from "@wcarankings/live-results";

type KnownPerson = {
  continentId: string;
  countryIso2: string;
};

type KnownPersonRow = RowDataPacket & {
  continentId: string;
  countryIso2: string;
  personId: string;
};

const knownPeopleQuery = (placeholders: string) => `
  SELECT
    person.wca_id AS personId,
    country.iso2 AS countryIso2,
    country.continent_id AS continentId
  FROM persons person
  INNER JOIN countries country ON country.id = person.country_id
  WHERE person.sub_id = 1
    AND person.wca_id IN (${placeholders})
`;

export function applyKnownPeople(
  snapshot: LiveResultsSnapshot,
  people: ReadonlyMap<string, KnownPerson>,
): LiveResultsSnapshot {
  const results: LiveResult[] = [];
  for (const result of snapshot.results) {
    const person = people.get(result.personId);
    if (!person) continue;
    results.push({ ...result, countryIso2: person.countryIso2 });
  }
  return { ...snapshot, results };
}

export async function enrichSnapshotPeople(
  connection: Connection,
  snapshot: LiveResultsSnapshot,
): Promise<LiveResultsSnapshot> {
  const personIds = [
    ...new Set(snapshot.results.map((result) => result.personId)),
  ];
  if (personIds.length === 0) return snapshot;
  const placeholders = personIds.map(() => "?").join(", ");
  const [rows] = await connection.query<KnownPersonRow[]>(
    knownPeopleQuery(placeholders),
    personIds,
  );
  const people = new Map<string, KnownPerson>(
    rows.map((row) => [
      row.personId,
      { countryIso2: row.countryIso2, continentId: row.continentId },
    ]),
  );
  return applyKnownPeople(snapshot, people);
}
