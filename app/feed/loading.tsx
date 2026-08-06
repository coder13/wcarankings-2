import { AppHeader } from "@/components/AppHeader/AppHeader";

export default function FeedLoading() {
  return (
    <div className="app">
      <AppHeader />
      <main className="feedPage feedLoading" aria-label="Loading feed">
        <p role="status">Loading feed…</p>
        {Array.from({ length: 2 }, (_, index) => (
          <div className="feedLoadingCard" key={index} aria-hidden="true">
            <div className="feedLoadingTitle" />
            <div className="feedLoadingRows">
              {Array.from({ length: 5 }, (_, row) => (
                <div className="feedLoadingRow" key={row} />
              ))}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
