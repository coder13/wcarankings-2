import { query } from "@/db";
import type {
  PersonIdRow,
  PersonIdSearchInput,
  PersonSearchDatabaseInput,
  PersonSearchRow,
} from "@/services/people/types";
import { escapeLikePrefix } from "@/services/people/helpers";
import { personIdsQuery, personSearchRowsQuery } from "@/services/people/queries";

function isMissingCompetitionCountsTable(error: unknown) {
  const databaseError = error as { code?: string; message?: string };
  return databaseError.code === "ER_NO_SUCH_TABLE" &&
    databaseError.message?.includes("person_competition_counts");
}

export async function fetchPersonSearchRowsFromDatabase(input: PersonSearchDatabaseInput) {
  const namePattern = input.regexSearch ? input.search : `${escapeLikePrefix(input.search)}%`;
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
    return query<PersonSearchRow>(personSearchRowsQuery(input, false), values);
  }
}

export async function fetchPersonIdsFromDatabase(input: PersonIdSearchInput) {
  const namePattern = input.regexSearch ? input.search : `${escapeLikePrefix(input.search)}%`;
  return query<PersonIdRow>(personIdsQuery(input), [
    input.search.toUpperCase(),
    namePattern,
    input.search.toUpperCase(),
    input.limit,
  ]);
}
