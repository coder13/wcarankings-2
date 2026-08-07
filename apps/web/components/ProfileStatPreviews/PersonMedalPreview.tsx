"use client";

import { useEffect, useState } from "react";
import { LoadingSpinner } from "@/components/LoadingSpinner/LoadingSpinner";
import {
  PersonMedalPreviewCounts,
  type MedalCounts,
} from "./PersonMedalPreviewCounts";

type Response = { counts: MedalCounts; error?: string };

export function PersonMedalPreview({ personId }: { personId: string }) {
  const [counts, setCounts] = useState<MedalCounts | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/people/${personId}/medals`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as Response;
        if (!response.ok)
          throw new Error(body.error ?? "Medals are unavailable.");
        setCounts(body.counts);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error ? cause.message : "Medals are unavailable.",
        );
      });
    return () => controller.abort();
  }, [personId]);

  let content;
  if (error) {
    content = <p className="profileStatsMessage">{error}</p>;
  } else if (!counts) {
    content = (
      <div className="profileStatsLoading">
        <LoadingSpinner label="Loading medals" />
      </div>
    );
  } else {
    content = <PersonMedalPreviewCounts counts={counts} />;
  }

  return <section className="profileMedalPreview">{content}</section>;
}
