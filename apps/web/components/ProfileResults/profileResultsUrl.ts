import type { RankingType } from "@/lib/wca";

export function profileResultsHref({
  personId,
  eventId,
  resultType,
  year = null,
}: {
  personId: string;
  eventId: string;
  resultType: RankingType;
  year?: number | null;
}) {
  const params = new URLSearchParams({ eventId, resultType });
  if (year !== null) params.set("year", `${year}`);
  return `/profile/${personId.toUpperCase()}/results?${params.toString()}`;
}
