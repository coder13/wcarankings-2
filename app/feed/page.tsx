import type { Metadata } from "next";
import { headers } from "next/headers";
import { AppHeader } from "@/components/AppHeader/AppHeader";
import { FeedStatPreviews } from "@/components/ProfileStatPreviews/FeedStatPreviews";
import { getAuthUser } from "@/services/auth/auth";
import { getRegions } from "@/services/regions/service";
import { loadFeedUserPreferences } from "@/services/feeds/preferences";
import { loadFeedStatPreviews } from "@/services/feeds/stat-previews";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Feed | WCA Rankings",
  description: "Recent WCA Rankings stat previews.",
};

async function getFeedPageData() {
  try {
    const [user, countries] = await Promise.all([
      getAuthUser(
        new Request("http://localhost", { headers: await headers() }),
      ),
      getRegions("country"),
    ]);
    const preferences = await loadFeedUserPreferences(user, countries);
    return {
      page: await loadFeedStatPreviews({ preferences }),
      unavailable: false,
    } as const;
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
