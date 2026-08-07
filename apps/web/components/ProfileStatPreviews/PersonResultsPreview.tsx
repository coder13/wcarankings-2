"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LoadingSpinner } from "@/components/LoadingSpinner/LoadingSpinner";
import type { PersonResultEntry } from "@/components/ProfileResults/PersonResultRow";
import { profileResultsHref } from "@/components/ProfileResults/profileResultsUrl";
import type { RankingType } from "@/lib/wca";
import { PersonResultsPreviewControls } from "./PersonResultsPreviewControls";
import { PersonResultsPreviewRows } from "./PersonResultsPreviewRows";
import { StatPreviewTable } from "./StatPreviewTable";

type Response = {
  entries: PersonResultEntry[];
  availableYears: number[];
  error?: string;
};

export function PersonResultsPreview({ personId }: { personId: string }) {
  const [eventId, setEventId] = useState("333");
  const [resultType, setResultType] = useState<RankingType>("single");
  const [year, setYear] = useState<number | null>(null);
  const [result, setResult] = useState<{
    key: string;
    entries: PersonResultEntry[];
    availableYears: number[];
  } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(
    null,
  );
  const requestKey = `${personId}:${eventId}:${resultType}:${year ?? ""}`;

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      result: resultType,
      limit: "5",
    });
    if (year !== null) params.set("year", `${year}`);
    fetch(
      `/api/people/${personId}/event/${eventId}/results?${params.toString()}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        const body = (await response.json()) as Response;
        if (!response.ok)
          throw new Error(body.error ?? "Stats are unavailable.");
        setResult({
          key: requestKey,
          entries: body.entries,
          availableYears: body.availableYears,
        });
        setError(null);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError({
          key: requestKey,
          message:
            cause instanceof Error ? cause.message : "Stats are unavailable.",
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
        <LoadingSpinner label="Loading results" />
      </div>
    );
  } else if (result.entries.length === 0) {
    content = <p className="profileStatsMessage">No official results.</p>;
  } else {
    content = (
      <PersonResultsPreviewRows
        entries={result.entries}
        eventId={eventId}
        resultType={resultType}
      />
    );
  }

  return (
    <StatPreviewTable
      tableName="Top Results"
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
      action={
        <Link
          className="profilePreviewExplore"
          href={profileResultsHref({ personId, eventId, resultType, year })}
        >
          Explore
        </Link>
      }
    >
      {content}
    </StatPreviewTable>
  );
}
