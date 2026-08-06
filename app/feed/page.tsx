import type { Metadata } from "next";
import { loadHomeFeed } from "@/services/feeds/home-feed";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Feed | WCA Rankings",
  description: "Recent WCA Rankings stat previews.",
};

async function getFeedPageData() {
  try {
    return { feed: await loadHomeFeed(), unavailable: false } as const;
  } catch {
    return { feed: null, unavailable: true } as const;
  }
}

function previewLabel(row: Record<string, unknown>, index: number) {
  return String(
    row.name ??
      row.personName ??
      row.entityName ??
      row.personId ??
      row.entityId ??
      row.id ??
      `#${index + 1}`,
  );
}

function previewValue(row: Record<string, unknown>) {
  return String(row.value ?? row.result ?? row.score ?? row.time ?? "");
}

export default async function FeedPage() {
  const { feed, unavailable } = await getFeedPageData();
  const cards = unavailable ? [] : (feed?.cards ?? []);

  return (
    <div className="app">
      <main className="feedPage" aria-label="Recent ranking changes">
        <ol className="feedCards">
          {cards.map((card) => (
            <li className="feedCard" key={card.cardId}>
              <div className="feedCardHeader">
                <h2>{card.title}</h2>
                {card.change && <p>{card.change.summary}</p>}
              </div>
              {card.previewRows.length > 0 && (
                <ol
                  className="feedPreview"
                  aria-label={`${card.title} preview`}
                >
                  {card.previewRows.slice(0, 5).map((row, index) => (
                    <li
                      className="feedPreviewRow"
                      key={`${card.cardId}-${index}`}
                    >
                      <span>{previewLabel(row, index)}</span>
                      <strong>{previewValue(row)}</strong>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ol>
        {cards.length === 0 && <p className="feedEmpty">No recent changes.</p>}
      </main>
    </div>
  );
}
