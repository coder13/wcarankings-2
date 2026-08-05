"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LoadingSpinner } from "@/components/LoadingSpinner/LoadingSpinner";
import { profileResultsHref } from "@/components/ProfileResults/profileResultsUrl";
import type { RankingType } from "@/lib/wca";

type PreviewEntry = {
  resultId: number;
  attemptNumber: number | null;
  formattedValue: string;
  competitionId: string;
  competitionName: string;
  competitionStartDate: string | null;
  recordCode: string;
};

type Preview = {
  id: string;
  title: string;
  resultType: RankingType;
  eventId: string;
  entries: PreviewEntry[];
  total: number;
};

type Response = {
  previews?: Preview[];
  error?: string;
};

function formatDate(value: string | null) {
  if (!value) return "Date unavailable";
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function ProfileStatPreviews({ personId }: { personId: string }) {
  const [previews, setPreviews] = useState<Preview[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/people/${personId}/profile/stats`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as Response;
        if (!response.ok)
          throw new Error(body.error ?? "Stats are unavailable.");
        setPreviews(body.previews ?? []);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error ? cause.message : "Stats are unavailable.",
        );
      });
    return () => controller.abort();
  }, [personId]);

  if (error) return <p className="profileStatsMessage">{error}</p>;
  if (!previews) {
    return (
      <div className="profileStatsLoading">
        <LoadingSpinner label="Loading stats" />
      </div>
    );
  }
  if (previews.length === 0)
    return <p className="profileStatsMessage">No stats are available.</p>;

  return (
    <div className="profilePreviewGrid">
      {previews.map((preview) => (
        <section className="profilePreview" key={preview.id}>
          <div className="profilePreviewHeading">
            <h3>{preview.title}</h3>
            <Link
              href={profileResultsHref({
                personId,
                eventId: preview.eventId,
                resultType: preview.resultType,
              })}
            >
              Explore
            </Link>
          </div>
          {preview.entries.length ? (
            <ol className="profilePreviewRows">
              {preview.entries.map((entry) => (
                <li key={`${entry.resultId}:${entry.attemptNumber ?? 0}`}>
                  <div>
                    <strong>{entry.formattedValue}</strong>
                    <span>{entry.competitionName}</span>
                  </div>
                  <div className="profilePreviewResultMeta">
                    {entry.recordCode && (
                      <span
                        className={`recordBadge recordBadge--${entry.recordCode}`}
                      >
                        {entry.recordCode}
                      </span>
                    )}
                    <span>{formatDate(entry.competitionStartDate)}</span>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="profileStatsMessage">No official results.</p>
          )}
        </section>
      ))}
    </div>
  );
}
