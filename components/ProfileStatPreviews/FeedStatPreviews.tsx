"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { RankingRow } from "@/components/RankingRow/RankingRow";
import { StatPreviewTable } from "./StatPreviewTable";
import { FeedLoadingSkeleton } from "./FeedLoadingSkeletons";
import type { FeedStatPreview } from "@/services/feeds/stat-previews";

type FeedStatPreviewPage = {
  previews: FeedStatPreview[];
  nextCursor: number | null;
};

async function fetchFeedPreviewPage(
  cursor: number,
  limit = 5,
): Promise<FeedStatPreviewPage> {
  const response = await fetch(`/api/feed?cursor=${cursor}&limit=${limit}`);
  if (!response.ok) throw new Error("Feed previews are unavailable.");
  return response.json() as Promise<FeedStatPreviewPage>;
}

function initialFeedSlots(
  previews: readonly FeedStatPreview[],
  cursor: number | null,
) {
  if (previews.length > 0) return previews.map((preview) => preview);
  if (cursor !== null) return Array.from({ length: 5 }, () => null);
  return [];
}

export function FeedStatPreviews({
  initialPreviews,
  initialCursor,
}: {
  initialPreviews: readonly FeedStatPreview[];
  initialCursor: number | null;
}) {
  const [slots, setSlots] = useState<Array<FeedStatPreview | null>>(() =>
    initialFeedSlots(initialPreviews, initialCursor),
  );
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loadingInitialPage, setLoadingInitialPage] = useState(
    initialPreviews.length === 0 && initialCursor !== null,
  );
  const loading = useRef(false);
  const itemCursor = useRef<number | null>(0);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialPreviews.length > 0 || initialCursor === null) return;
    loading.current = true;
    void fetch(`/api/feed?items=${initialCursor}`)
      .then((response) => response.json())
      .then((page: { nextCursor: number | null }) => {
        itemCursor.current = page.nextCursor;
      });
    void (async () => {
      let cursor: number | null = 0;
      let slotIndex = 0;
      while (cursor !== null && slotIndex < 5) {
        const page = await fetchFeedPreviewPage(cursor, 5);
        for (const preview of page.previews) {
          if (slotIndex >= 5) break;
          const currentSlot = slotIndex;
          setSlots((current) => {
            const next = [...current];
            next[currentSlot] = preview;
            return next;
          });
          slotIndex += 1;
          setLoadingInitialPage(false);
        }
        cursor = page.nextCursor;
      }
      setSlots((current) => current.slice(0, slotIndex));
      setNextCursor(cursor);
    })()
      .catch(() => {
        setLoadingInitialPage(false);
        setNextCursor(null);
        setSlots((current) => current.filter(Boolean));
      })
      .finally(() => {
        loading.current = false;
      });
  }, [initialCursor, initialPreviews.length]);

  useEffect(() => {
    const element = sentinel.current;
    if (!element || nextCursor === null) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || loading.current || nextCursor === null)
          return;
        loading.current = true;
        setSlots((current) => [
          ...current,
          ...Array.from({ length: 5 }, () => null),
        ]);
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
        void (async () => {
          let cursor: number | null = nextCursor;
          let slotIndex = slots.length;
          const firstNewSlot = slotIndex;
          while (cursor !== null && slotIndex < firstNewSlot + 5) {
            const page = await fetchFeedPreviewPage(cursor, 5);
            for (const preview of page.previews) {
              if (slotIndex >= firstNewSlot + 5) break;
              const currentSlot = slotIndex;
              setSlots((current) => {
                const next = [...current];
                next[currentSlot] = preview;
                return next;
              });
              slotIndex += 1;
            }
            cursor = page.nextCursor;
          }
          setSlots((current) => current.slice(0, slotIndex));
          setNextCursor(cursor);
        })()
          .catch(() => setNextCursor(null))
          .finally(() => {
            loading.current = false;
          });
      },
      { rootMargin: "800px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [nextCursor, slots.length]);

  return (
    <>
      {loadingInitialPage && slots.length === 0 && (
        <div className="feedLoading feedInlineLoading" role="status">
          <p>Loading feed…</p>
        </div>
      )}
      <ol className="feedCards">
        {slots.map((preview, index) => (
          <li
            key={
              preview
                ? `${preview.id}:${preview.interestingEntityId ?? index}`
                : `loading:${index}`
            }
          >
            {!preview && <FeedLoadingSkeleton />}
            {preview && (
              <StatPreviewTable
                tableName={preview.title}
                surfaceClassName="profileRankingHighlightPreviewTable"
                labelClassName="profilePreviewLabel--feed"
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
                        highlightedStyle: "tint",
                        highlighted: preview.highlightedCompetitionIds.includes(
                          entry.competitionId,
                        ),
                        rankIsDuplicate:
                          index > 0 &&
                          preview.entries[index - 1]?.rank === entry.rank,
                        hideIdentityId: preview.kind === "city",
                      }}
                    />
                  ))}
                </ol>
              </StatPreviewTable>
            )}
          </li>
        ))}
      </ol>
      <div ref={sentinel} aria-hidden="true" />
    </>
  );
}
