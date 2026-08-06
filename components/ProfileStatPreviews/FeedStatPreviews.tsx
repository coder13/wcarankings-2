"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { RankingRow } from "@/components/RankingRow/RankingRow";
import { StatPreviewTable } from "./StatPreviewTable";
import type { FeedStatPreview } from "@/services/feeds/stat-previews";

export function FeedStatPreviews({
  initialPreviews,
  initialCursor,
}: {
  initialPreviews: readonly FeedStatPreview[];
  initialCursor: number | null;
}) {
  const [previews, setPreviews] = useState([...initialPreviews]);
  const [nextCursor, setNextCursor] = useState(initialCursor);
  const loading = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = sentinel.current;
    if (!element || nextCursor === null) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || loading.current || nextCursor === null)
          return;
        loading.current = true;
        fetch(`/api/feed?cursor=${nextCursor}`)
          .then((response) => response.json())
          .then(
            (page: {
              previews: FeedStatPreview[];
              nextCursor: number | null;
            }) => {
              setPreviews((current) => [...current, ...page.previews]);
              setNextCursor(page.nextCursor);
            },
          )
          .finally(() => {
            loading.current = false;
          });
      },
      { rootMargin: "800px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [nextCursor]);

  return (
    <>
      <ol className="feedCards">
        {previews.map((preview) => (
          <li key={preview.id}>
            <StatPreviewTable
              tableName={preview.title}
              surfaceClassName="profileRankingHighlightPreviewTable"
              action={
                <Link
                  className="profilePreviewExplore"
                  href={preview.exploreUrl}
                >
                  Explore
                </Link>
              }
            >
              <ol className="list profilePreviewRows profileRankingHighlightRows">
                {preview.entries.map((entry, index) => (
                  <RankingRow
                    key={`${preview.id}:${entry.entryKey ?? entry.resultId ?? index}`}
                    entry={entry}
                    display={{
                      eventId: preview.eventId,
                      rankingType: preview.resultType,
                      animationIndex: index,
                      alternate: index % 2 === 1,
                      highlighted: preview.highlightedCompetitionIds.includes(
                        entry.competitionId,
                      ),
                      rankIsDuplicate:
                        index > 0 &&
                        preview.entries[index - 1]?.rank === entry.rank,
                    }}
                  />
                ))}
              </ol>
            </StatPreviewTable>
          </li>
        ))}
      </ol>
      <div ref={sentinel} aria-hidden="true" />
    </>
  );
}
