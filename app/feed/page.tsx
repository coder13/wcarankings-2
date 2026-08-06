import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader/AppHeader";
import { FeedStatPreviews } from "@/components/ProfileStatPreviews/FeedStatPreviews";
import { loadFeedStatPreviews } from "@/services/feeds/stat-previews";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Feed | WCA Rankings",
  description: "Recent WCA Rankings stat previews.",
};

async function getFeedPageData() {
  try {
    return { page: await loadFeedStatPreviews(), unavailable: false } as const;
  } catch {
    return {
      page: { previews: [], nextCursor: null },
      unavailable: true,
    } as const;
  }
}

export default async function FeedPage() {
  const { page, unavailable } = await getFeedPageData();

  return (
    <div className="app">
      <AppHeader />
      <main className="feedPage" aria-label="Recent ranking changes">
        <FeedStatPreviews
          initialPreviews={page.previews}
          initialCursor={page.nextCursor}
        />
        {(unavailable || page.previews.length === 0) && (
          <p className="feedEmpty">No recent changes.</p>
        )}
      </main>
    </div>
  );
}
