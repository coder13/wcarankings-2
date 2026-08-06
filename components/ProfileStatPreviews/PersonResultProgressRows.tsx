import { formatWcaResult, type RankingType } from "@/lib/wca";
import type { PersonResultProgressPoint } from "@/services/rankings/person-result-progress";

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

export function PersonResultProgressRows({
  points,
  eventId,
  resultType,
}: {
  points: PersonResultProgressPoint[];
  eventId: string;
  resultType: RankingType;
}) {
  return (
    <ol className="profileResultProgressRows">
      {points.map((point, index) => (
        <li
          className={`profileResultProgressRow${index % 2 ? " profileResultProgressRow--alternate" : ""}`}
          key={point.competitionId}
        >
          <time dateTime={point.competitionStartDate}>
            {formatDate(point.competitionStartDate)}
          </time>
          <span>{point.competitionName}</span>
          <strong>
            {formatWcaResult(eventId, point.resultValue, resultType)}
          </strong>
        </li>
      ))}
    </ol>
  );
}
