import { query } from "@/db";
import type {
  PersonIdRow,
  PersonIdSearchInput,
  PersonSearchDatabaseInput,
  PersonSearchRow,
} from "@/services/people/types";
import { escapeLikePrefix } from "@/services/people/helpers";
import {
  personCompetitionCountsQuery,
  personIdsQuery,
  personSearchRowsQuery,
} from "@/services/people/queries";

function isMissingCompetitionCountsTable(error: unknown) {
  const databaseError = error as { code?: string; message?: string };
  return (
    databaseError.code === "ER_NO_SUCH_TABLE" &&
    databaseError.message?.includes("person_period_metrics")
  );
}

export async function fetchPersonSearchRowsFromDatabase(
  input: PersonSearchDatabaseInput,
) {
  const namePattern = input.regexSearch
    ? input.search
    : `${escapeLikePrefix(input.search)}%`;
  const values = [
    `${escapeLikePrefix(input.search.toUpperCase())}%`,
    namePattern,
    input.search.toUpperCase(),
    input.offset,
    input.limit,
  ];
  try {
    return await query<PersonSearchRow>(personSearchRowsQuery(input), values);
  } catch (error) {
    if (!isMissingCompetitionCountsTable(error)) throw error;
    const people = await query<PersonSearchRow>(
      personSearchRowsQuery(input, false),
      values,
    );
    if (!people.rows.length) return people;
    const counts = await query<{
      person_id: string;
      competition_count: number;
    }>(
      personCompetitionCountsQuery(people.rows.map((person) => person.wca_id)),
      people.rows.map((person) => person.wca_id),
    );
    const countsByPersonId = new Map(
      counts.rows.map((count) => [
        count.person_id,
        Number(count.competition_count),
      ]),
    );
    return {
      ...people,
      rows: people.rows.map((person) => ({
        ...person,
        competition_count: countsByPersonId.get(person.wca_id) ?? 0,
      })),
      timings: {
        ...people.timings,
        statementMs: people.timings.statementMs + counts.timings.statementMs,
      },
    };
  }
}

export async function fetchPersonIdsFromDatabase(input: PersonIdSearchInput) {
  const namePattern = input.regexSearch
    ? input.search
    : `${escapeLikePrefix(input.search)}%`;
  return query<PersonIdRow>(personIdsQuery(input), [
    input.search.toUpperCase(),
    namePattern,
    input.search.toUpperCase(),
    input.limit,
  ]);
}
