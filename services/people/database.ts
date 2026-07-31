import { query } from "@/db";
import type {
  PersonIdRow,
  PersonIdSearchInput,
  PersonSearchDatabaseInput,
  PersonSearchRow,
} from "@/services/people/types";
import { escapeLikePrefix } from "@/services/people/helpers";
import { personIdsQuery, personSearchRowsQuery } from "@/services/people/queries";

export async function fetchPersonSearchRowsFromDatabase(input: PersonSearchDatabaseInput) {
  const namePattern = input.regexSearch ? input.search : `${escapeLikePrefix(input.search)}%`;
  return query<PersonSearchRow>(personSearchRowsQuery(input), [
    `${escapeLikePrefix(input.search.toUpperCase())}%`,
    namePattern,
    input.search.toUpperCase(),
    input.offset,
    input.limit,
  ]);
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
