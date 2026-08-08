import type { Metadata } from "next";
import { FeedPage } from "@/components/FeedPage/FeedPage";

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

export default async function Home() {
  const { page, unavailable } = await getFeedPageData();

  return (
    <FeedPage
      initialPreviews={page.previews}
      initialCursor={page.nextCursor}
      unavailable={unavailable}
    />
  );
}
