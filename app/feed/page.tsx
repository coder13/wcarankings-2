import type { Metadata } from "next";
import { AppHeader } from "@/components/AppHeader/AppHeader";
import { FeedStatPreviews } from "@/components/ProfileStatPreviews/FeedStatPreviews";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Feed | WCA Rankings",
  description: "Recent WCA Rankings stat previews.",
};

async function getFeedPageData() {
  return {
    page: { previews: [], nextCursor: 0 },
    unavailable: false,
  } as const;
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
        {unavailable && <p className="feedEmpty">Feed unavailable.</p>}
      </main>
    </div>
  );
}
