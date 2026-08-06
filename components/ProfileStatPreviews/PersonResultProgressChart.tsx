"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatWcaResult, type RankingType } from "@/lib/wca";
import type { PersonResultProgressPoint } from "@/services/rankings/person-result-progress";

interface ResultProgressTooltipPayload {
  payload?: PersonResultProgressPoint;
}

interface ResultProgressTooltipProps {
  active?: boolean;
  payload?: readonly ResultProgressTooltipPayload[];
  eventId: string;
  resultType: RankingType;
}

interface PersonResultProgressChartProps {
  points: PersonResultProgressPoint[];
  eventId: string;
  resultType: RankingType;
}

function formatDate(date: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(undefined, options).format(
    new Date(`${date}T12:00:00`),
  );
}

function getResultDomain(points: PersonResultProgressPoint[]) {
  const values = points.map((point) => point.resultValue);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum;
  const padding = Math.max(range * 0.1, maximum * 0.02, 1);

  return [Math.max(0, minimum - padding), maximum + padding] as const;
}

function ResultProgressTooltip({
  active,
  payload,
  eventId,
  resultType,
}: ResultProgressTooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <div className="profileResultProgressTooltip">
      <strong>{formatWcaResult(eventId, point.resultValue, resultType)}</strong>
      <span>{point.competitionName}</span>
      <time dateTime={point.competitionStartDate}>
        {formatDate(point.competitionStartDate, { dateStyle: "medium" })}
      </time>
    </div>
  );
}

export function PersonResultProgressChart({
  points,
  eventId,
  resultType,
}: PersonResultProgressChartProps) {
  const resultDomain = getResultDomain(points);

  return (
    <div className="profileResultProgressChart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={points}
          margin={{ top: 18, right: 18, bottom: 8, left: 4 }}
        >
          <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 3" />
          <XAxis
            dataKey="competitionStartDate"
            minTickGap={34}
            tick={{ fill: "var(--text-subtle)", fontSize: 11 }}
            tickFormatter={(date) => formatDate(date, { year: "numeric" })}
            tickLine={false}
          />
          <YAxis
            dataKey="resultValue"
            domain={resultDomain}
            tick={{ fill: "var(--text-subtle)", fontSize: 11 }}
            tickFormatter={(value) =>
              formatWcaResult(eventId, value, resultType)
            }
            tickLine={false}
            width={58}
          />
          <Tooltip
            allowEscapeViewBox={{ x: true, y: true }}
            content={(properties) => (
              <ResultProgressTooltip
                {...properties}
                eventId={eventId}
                resultType={resultType}
              />
            )}
            cursor={{ stroke: "var(--focus)", strokeWidth: 1 }}
          />
          <Line
            type="stepAfter"
            dataKey="resultValue"
            stroke="var(--focus)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--focus)", strokeWidth: 0 }}
            activeDot={{
              r: 5,
              fill: "var(--surface)",
              stroke: "var(--focus)",
              strokeWidth: 2,
            }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
