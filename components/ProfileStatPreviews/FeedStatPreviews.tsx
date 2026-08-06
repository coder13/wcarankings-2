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
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loadingNextPage, setLoadingNextPage] = useState(false);
  const loading = useRef(false);
  const itemCursor = useRef<number | null>(0);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialPreviews.length > 0 || initialCursor === null) return;
    void fetch(`/api/feed?items=${initialCursor}`)
      .then((response) => response.json())
      .then((page: { nextCursor: number | null }) => {
        itemCursor.current = page.nextCursor;
      });
    void fetch(`/api/feed?cursor=0`)
      .then((response) => response.json())
      .then(
        (page: { previews: FeedStatPreview[]; nextCursor: number | null }) => {
          setPreviews(page.previews);
          setNextCursor(page.nextCursor);
        },
      );
  }, [initialCursor, initialPreviews.length]);

  useEffect(() => {
    const element = sentinel.current;
    if (!element || nextCursor === null) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || loading.current || nextCursor === null)
          return;
        loading.current = true;
        setLoadingNextPage(true);
        if (
          itemCursor.current !== null &&
          nextCursor >= itemCursor.current - 10
        ) {
          void fetch(`/api/feed?items=${itemCursor.current}`)
            .then((response) => response.json())
            .then((page: { nextCursor: number | null }) => {
              itemCursor.current = page.nextCursor;
            });
        }
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
            setLoadingNextPage(false);
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
        {previews.map((preview, index) => (
          <li key={`${preview.id}:${preview.interestingEntityId ?? index}`}>
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
              <ol className="list profilePreviewRows profileRankingHighlightRows feedRankingRows">
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
      {loadingNextPage && (
        <div className="feedLoadingMore" role="status">
          Loading more feed stats
        </div>
      )}
      <div ref={sentinel} aria-hidden="true" />
    </>
  );
}
