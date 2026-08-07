"use client";

import { useEffect, useState } from "react";
import { LoadingSpinner } from "@/components/LoadingSpinner/LoadingSpinner";
import { formatWcaResult, WCA_EVENTS } from "@/lib/wca";
import type {
  PersonalBestPreview,
  PersonalBestPreviewRank,
  PersonalBestPreviewResult,
} from "@/services/people/personal-bests-preview";
import { StatPreviewTable } from "./StatPreviewTable";

type Response = { entries: PersonalBestPreview[]; error?: string };

function PersonalBestRanks({
  result,
  scopes,
  className,
}: {
  result?: PersonalBestPreviewResult;
  scopes: readonly PersonalBestPreviewRank["scope"][];
  className: string;
}) {
  return (
    <div className={className}>
      {scopes.map((scope) => {
        const rank = result?.ranks.find(
          (candidate) => candidate.scope === scope,
        );
        return (
          <span
            className="profilePersonalBestRank"
            key={scope}
            data-record={rank?.value === 1 || undefined}
            data-scope={scope}
          >
            {rank ? new Intl.NumberFormat().format(rank.value) : ""}
          </span>
        );
      })}
    </div>
  );
}

function PersonalBestRow({ entry }: { entry: PersonalBestPreview }) {
  const single = entry.single;
  const event = WCA_EVENTS.find((candidate) => candidate.id === entry.eventId);
  if (!single) return null;

  return (
    <section className="profilePersonalBestRow">
      <h3>
        <span
          className={`cubing-icon event-${entry.eventId}`}
          aria-label={entry.eventId}
        />
        <span className="profilePersonalBestEventName profilePersonalBestEventName--full">
          {event?.name ?? entry.eventId}
        </span>
        <span className="profilePersonalBestEventName profilePersonalBestEventName--short">
          {event?.shortName ?? entry.eventId}
        </span>
      </h3>
      <div className="profilePersonalBestResultGroup profilePersonalBestSingleGroup">
        <strong>{formatWcaResult(entry.eventId, single.value)}</strong>
        <PersonalBestRanks
          className="profilePersonalBestSingleRanks"
          result={single}
          scopes={["NR", "CR", "WR"]}
        />
      </div>
      <div className="profilePersonalBestResultGroup profilePersonalBestAverageGroup">
        <strong>
          {entry.average
            ? formatWcaResult(entry.eventId, entry.average.value, "average")
            : ""}
        </strong>
        <PersonalBestRanks
          className="profilePersonalBestAverageRanks"
          result={entry.average}
          scopes={["WR", "CR", "NR"]}
        />
      </div>
    </section>
  );
}

export function PersonalBestsPreview({ personId }: { personId: string }) {
  const [entries, setEntries] = useState<PersonalBestPreview[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/people/${personId}/personal-bests`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as Response;
        if (!response.ok)
          throw new Error(body.error ?? "Personal bests are unavailable.");
        setEntries(body.entries);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Personal bests are unavailable.",
        );
      });
    return () => controller.abort();
  }, [personId]);

  let content;
  if (error) {
    content = <p className="profileStatsMessage">{error}</p>;
  } else if (!entries) {
    content = (
      <div className="profileStatsLoading">
        <LoadingSpinner label="Loading personal bests" />
      </div>
    );
  } else if (entries.length === 0) {
    content = <p className="profileStatsMessage">No personal bests.</p>;
  } else {
    content = entries.map((entry) => (
      <PersonalBestRow entry={entry} key={entry.eventId} />
    ));
  }

  return (
    <StatPreviewTable>
      <div className="profilePersonalBests">
        <div className="profilePersonalBestColumnHeaders" aria-hidden="true">
          <span />
          <span className="profilePersonalBestSingleRankHeaders">
            <span>NR</span>
            <span>CR</span>
            <span>WR</span>
          </span>
          <span className="profilePersonalBestResultHeader profilePersonalBestSingleResultHeader">
            Single
          </span>
          <span className="profilePersonalBestResultHeader profilePersonalBestAverageResultHeader">
            Average
          </span>
          <span className="profilePersonalBestAverageRankHeaders">
            <span>WR</span>
            <span>CR</span>
            <span>NR</span>
          </span>
        </div>
        {content}
      </div>
    </StatPreviewTable>
  );
}
