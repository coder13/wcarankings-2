import { AppHeader } from "@/components/AppHeader/AppHeader";
import { FeedLoadingSkeletons } from "@/components/ProfileStatPreviews/FeedLoadingSkeletons";

export default function FeedLoading() {
  return (
    <div className="app">
      <AppHeader />
      <main className="feedPage feedLoading" aria-label="Loading feed">
        <p role="status">Loading feed…</p>
        <FeedLoadingSkeletons />
      </main>
    </div>
  );
}
