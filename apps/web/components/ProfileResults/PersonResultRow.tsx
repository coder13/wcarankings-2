import { formatRankingNumber } from "@/components/RankingsExplorer/types";
import { formatWcaResult, type RankingType } from "@/lib/wca";

export type PersonResultEntry = {
  rank: number;
  position: number;
  resultId: number;
  attemptNumber: number | null;
  resultValue: number;
  formattedValue: string;
  personId: string;
  personName: string;
  competitionId: string;
  competitionName: string;
  competitionStartDate: string | null;
  recordCode: string;
};

function formatDate(value: string | null) {
  if (!value) return "Date unavailable";
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function PersonResultRow({
  entry,
  eventId,
  resultType,
  rowIndex,
}: {
  entry: PersonResultEntry;
  eventId: string;
  resultType: RankingType;
  rowIndex: number;
}) {
  return (
    <div className="listItem">
      <div className={`row${rowIndex % 2 ? " row--alternate" : ""}`}>
        <div className="rowHeader">
          <span className="rank">{formatRankingNumber(entry.rank)}</span>
          <span className="identity">
            <span className="personName">
              <span className="name">{entry.competitionName}</span>
              <span className="wcaId">
                {formatDate(entry.competitionStartDate)}
              </span>
            </span>
          </span>
          <span className="result">
            <span className="resultValue">
              {entry.recordCode && (
                <span className="recordBadges">
                  <span
                    className={`recordBadge recordBadge--${entry.recordCode}`}
                  >
                    {entry.recordCode}
                  </span>
                </span>
              )}
              <span className="best">
                {entry.formattedValue ||
                  formatWcaResult(eventId, entry.resultValue, resultType)}
              </span>
            </span>
            {entry.attemptNumber !== null && (
              <span className="competitionName">
                Attempt {entry.attemptNumber}
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
