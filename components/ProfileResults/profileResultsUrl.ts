import type { RankingType } from "@/lib/wca";

export function profileResultsHref({
  personId,
  eventId,
  resultType,
}: {
  personId: string;
  eventId: string;
  resultType: RankingType;
}) {
  const params = new URLSearchParams({ eventId, resultType });
  return `/profile/${personId.toUpperCase()}/results?${params.toString()}`;
}
