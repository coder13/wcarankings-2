"use client";

import { useEffect, useState } from "react";
import { LoadingSpinner } from "@/components/LoadingSpinner/LoadingSpinner";
import type { RankingType } from "@/lib/wca";
import { PersonResultProgressChart } from "./PersonResultProgressChart";
import { PersonResultProgressRows } from "./PersonResultProgressRows";
import { PersonResultsPreviewControls } from "./PersonResultsPreviewControls";
import {
  PersonResultsPreviewViewToggle,
  type PersonResultsPreviewView,
} from "./PersonResultsPreviewViewToggle";
import { StatPreviewTable } from "./StatPreviewTable";

type ProgressResponse = {
  points: Array<{
    competitionId: string;
    competitionName: string;
    competitionStartDate: string;
    resultValue: number;
  }>;
  availableYears: number[];
  error?: string;
};

export function PersonResultProgressPreview({
  personId,
}: {
  personId: string;
}) {
  const [eventId, setEventId] = useState("333");
  const [resultType, setResultType] = useState<RankingType>("single");
  const [year, setYear] = useState<number | null>(null);
  const [view, setView] = useState<PersonResultsPreviewView>("chart");
  const [result, setResult] = useState<{
    key: string;
    points: ProgressResponse["points"];
    availableYears: number[];
  } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(
    null,
  );
  const requestKey = `${personId}:${eventId}:${resultType}:${year ?? ""}`;

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ result: resultType });
    if (year !== null) params.set("year", `${year}`);
    fetch(
      `/api/people/${personId}/event/${eventId}/progress?${params.toString()}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        const body = (await response.json()) as ProgressResponse;
        if (!response.ok)
          throw new Error(body.error ?? "Personal records are unavailable.");
        setResult({
          key: requestKey,
          points: body.points,
          availableYears: body.availableYears,
        });
        setError(null);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError({
          key: requestKey,
          message:
            cause instanceof Error
              ? cause.message
              : "Personal records are unavailable.",
        });
      });
    return () => controller.abort();
  }, [eventId, personId, requestKey, resultType, year]);

  let content;
  if (error?.key === requestKey) {
    content = <p className="profileStatsMessage">{error.message}</p>;
  } else if (result?.key !== requestKey) {
    content = (
      <div className="profileStatsLoading">
        <LoadingSpinner label="Loading personal records" />
      </div>
    );
  } else if (result.points.length === 0) {
    content = <p className="profileStatsMessage">No personal records.</p>;
  } else if (view === "chart") {
    content = (
      <PersonResultProgressChart
        points={result.points}
        eventId={eventId}
        resultType={resultType}
      />
    );
  } else {
    content = (
      <PersonResultProgressRows
        points={result.points}
        eventId={eventId}
        resultType={resultType}
      />
    );
  }

  return (
    <StatPreviewTable
      tableName="PR History"
      labelAction={
        <PersonResultsPreviewViewToggle value={view} onChange={setView} />
      }
      controls={
        <PersonResultsPreviewControls
          eventId={eventId}
          resultType={resultType}
          year={year}
          availableYears={result?.availableYears ?? []}
          onEventChange={(nextEventId) => {
            setEventId(nextEventId);
            if (nextEventId === "333mbf") setResultType("single");
          }}
          onResultTypeChange={setResultType}
          onYearChange={setYear}
        />
      }
    >
      {content}
    </StatPreviewTable>
  );
}
