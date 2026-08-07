import { notFound } from "next/navigation";
import { ProfileResults } from "@/components/ProfileResults/ProfileResults";
import { normalizeProfileWcaId } from "@/lib/person-profile";
import { isEventId, isRankingType } from "@/lib/wca";

export const dynamic = "force-dynamic";

interface ProfileResultsSearchParams {
  eventId?: string;
  resultType?: string;
  year?: string;
}

interface ProfileResultsPageProps {
  params: Promise<{ wcaId: string }>;
  searchParams: Promise<ProfileResultsSearchParams>;
}

export default async function ProfileResultsPage({
  params,
  searchParams,
}: ProfileResultsPageProps) {
  const [{ wcaId }, query] = await Promise.all([params, searchParams]);
  const personId = normalizeProfileWcaId(wcaId);
  if (!personId) notFound();
  const requestedEventId = query.eventId ?? null;
  const requestedResultType = query.resultType ?? null;
  const eventId = isEventId(requestedEventId) ? requestedEventId : "333";
  const resultType = isRankingType(requestedResultType)
    ? requestedResultType
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
