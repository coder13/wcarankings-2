import {
  PersonResultRow,
  type PersonResultEntry,
} from "@/components/ProfileResults/PersonResultRow";
import type { RankingType } from "@/lib/wca";

export function PersonResultsPreviewRows({
  entries,
  eventId,
  resultType,
}: {
  entries: PersonResultEntry[];
  eventId: string;
  resultType: RankingType;
}) {
  return (
    <ol className="list profilePreviewRows">
      {entries.map((entry) => (
        <PersonResultRow
          key={`${entry.resultId}:${entry.attemptNumber ?? 0}`}
          entry={entry}
          eventId={eventId}
          resultType={resultType}
          rowIndex={entry.position - 1}
        />
      ))}
    </ol>
  );
}
