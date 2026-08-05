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
  searchParams: Promise<{ eventId?: string; resultType?: string }>;
}) {
  const [{ wcaId }, query] = await Promise.all([params, searchParams]);
  const personId = normalizeProfileWcaId(wcaId);
  if (!personId) notFound();
  const eventId = isEventId(query.eventId) ? query.eventId : "333";
  const resultType = isRankingType(query.resultType)
    ? query.resultType
    : "single";
  return (
    <main className="app profileResultsPage">
      <ProfileResults
        personId={personId}
        eventId={eventId}
        resultType={eventId === "333mbf" ? "single" : resultType}
      />
    </main>
  );
}
