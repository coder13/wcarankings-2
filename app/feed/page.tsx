import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader/AppHeader";
import { loadHomeFeed } from "@/services/feeds/home-feed";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Recent changes | WCA Rankings",
  description: "Recent changes in World Cube Association rankings.",
};

async function getFeedPageData() {
  try {
    return { feed: await loadHomeFeed(), unavailable: false } as const;
  } catch {
    return { feed: null, unavailable: true } as const;
  }
}

export default async function FeedPage() {
  const { feed, unavailable } = await getFeedPageData();
  let content;

  if (unavailable) {
    content = (
      <section className="feedEmpty" aria-live="polite">
        <h3>The feed is not ready yet.</h3>
        <p>
          Recent ranking changes will appear here when feed data is available.
        </p>
        <Link className="feedLink" href="/">
          Browse rankings
        </Link>
      </section>
    );
  } else if (feed?.cards.length) {
    content = (
      <ol className="feedCards">
        {feed.cards.map((card) => (
          <li className="feedCard" key={card.cardId}>
            <p className="feedCardType">
              {card.change?.type ?? "Recent change"}
            </p>
            <h3>{card.title}</h3>
            <p>{card.change?.summary ?? "This ranking changed."}</p>
            <Link className="feedLink" href={card.exploreUrl}>
              Open ranking
            </Link>
          </li>
        ))}
      </ol>
    );
  } else {
    content = (
      <section className="feedEmpty" aria-live="polite">
        <h3>No recent changes.</h3>
        <p>Check again after the next competition results update.</p>
      </section>
    );
  }

  return (
    <div className="app">
      <AppHeader />
      <main className="feedPage">
        <section className="feedIntro" aria-labelledby="feed-title">
          <p className="feedEyebrow">Home feed</p>
          <h2 id="feed-title">Recent changes</h2>
          <p>Browse ranking lists that changed after a recent competition.</p>
        </section>
        {content}
      </main>
    </div>
  );
}
