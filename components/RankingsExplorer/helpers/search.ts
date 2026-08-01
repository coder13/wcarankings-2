import type { RankingEntry } from "../types";

export function orderSearchMatches(
  matches: Array<RankingEntry | null | undefined>,
) {
  return matches.filter((match): match is RankingEntry => Boolean(match)).sort(
    (left, right) =>
      left.subRank - right.subRank ||
      left.rank - right.rank ||
      left.personName.localeCompare(right.personName) ||
      left.personId.localeCompare(right.personId),
  );
}
