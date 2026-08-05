import { notFound } from "next/navigation";
import { ProfileResults } from "@/components/ProfileResults/ProfileResults";
import { normalizeProfileWcaId } from "@/lib/person-profile";
import { isEventId, isRankingType } from "@/lib/wca";

export const dynamic = "force-dynamic";

export default async function ProfileResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ wcaId: string }>;
  searchParams: Promise<{
    eventId?: string;
    resultType?: string;
    year?: string;
  }>;
}) {
  const [{ wcaId }, query] = await Promise.all([params, searchParams]);
  const personId = normalizeProfileWcaId(wcaId);
  if (!personId) notFound();
  const eventId = isEventId(query.eventId) ? query.eventId : "333";
  const resultType = isRankingType(query.resultType)
    ? query.resultType
    : "single";
  const year = /^\d{4}$/.test(query.year ?? "") ? Number(query.year) : null;
  return (
    <ProfileResults
      personId={personId}
      eventId={eventId}
      resultType={eventId === "333mbf" ? "single" : resultType}
      year={year}
    />
  );
}
