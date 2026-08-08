"use client";

import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader/AppHeader";
import { FeedStatPreviews } from "@/components/ProfileStatPreviews/FeedStatPreviews";
import { navigationPath } from "@/components/RankingsExplorer/helpers/navigation";
import type { FeedStatPreview } from "@/services/feeds/stat-previews";

export function FeedPage({
  initialCursor,
  initialPreviews,
  unavailable,
}: {
  initialCursor: number | null;
  initialPreviews: readonly FeedStatPreview[];
  unavailable: boolean;
}) {
  const router = useRouter();

  return (
    <div className="app">
      <AppHeader
        subject="feed"
        onSubjectChange={(subject) => {
          if (subject !== "feed") router.push(navigationPath(subject));
        }}
      />
      <main className="feedPage" aria-label="Recent ranking changes">
        <FeedStatPreviews
          initialPreviews={initialPreviews}
          initialCursor={initialCursor}
        />
        {unavailable && <p className="feedEmpty">Feed unavailable.</p>}
      </main>
    </div>
  );
}
