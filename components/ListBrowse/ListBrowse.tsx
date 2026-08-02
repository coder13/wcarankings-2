"use client";

import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader/AppHeader";
import { ListBrowseControlsRail, ListBrowsePagerRail } from "@/components/RankingsRail/RankingsRail";
import type { PublicListSummary } from "@/services/lists/types";
import { motionSafeScrollBehavior } from "@/lib/motion-preferences";
import { ListRow } from "./ListRow";
import { ListCreateTrigger } from "@/components/ListOwnerControls/ListOwnerControls";
import "./ListBrowse.css";
import { subjectPath } from "@/components/RankingsExplorer/helpers/navigation";

export function listBrowseLoadState(
  lists: PublicListSummary[] | null,
  error: boolean,
) {
  if (error) return "error" as const;
  return lists === null ? "loading" as const : "ready" as const;
}

export function ListBrowse({ lists: initialLists }: { lists?: PublicListSummary[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [lists, setLists] = useState<PublicListSummary[] | null>(initialLists ?? null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (initialLists) return;
    const controller = new AbortController();
    void fetch("/api/lists/browse", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load public lists.");
        const body = await response.json() as { lists?: PublicListSummary[] };
        setLists(body.lists ?? []);
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string }).name !== "AbortError") setError(true);
      });
    return () => controller.abort();
  }, [initialLists]);

  const filtered = useMemo(() => {
    if (!lists) return [];
    const search = query.trim().toLocaleLowerCase();
    return search ? lists.filter((list) => `${list.name} ${list.createdBy ?? ""}`.toLocaleLowerCase().includes(search)) : lists;
  }, [lists, query]);
  const virtualizer = useWindowVirtualizer({ count: filtered.length, estimateSize: () => 65, overscan: 12 });
  const loadState = listBrowseLoadState(lists, error);
  let listContent: ReactNode;
  if (loadState === "loading") {
    listContent = (
      <ol className="listBrowseList listBrowseSkeleton" aria-label="Loading public lists" aria-busy="true">
        {Array.from({ length: 10 }, (_, index) => <li key={index}><span /><span /></li>)}
      </ol>
    );
  } else if (loadState === "error") {
    listContent = <p className="listBrowseEmpty" role="alert">Could not load public lists. Please refresh and try again.</p>;
  } else if (filtered.length) {
    listContent = (
      <ol className="listBrowseList" style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((row) => (
          <div key={row.key} style={{ transform: `translateY(${row.start}px)` }} className="virtualRow">
            <ListRow list={filtered[row.index]!} index={row.index} />
          </div>
        ))}
      </ol>
    );
  } else {
    listContent = <p className="listBrowseEmpty">No public lists match “{query}”.</p>;
  }

  return (
    <div className="app">
      <AppHeader
        subject="lists"
        onSubjectChange={(value) => {
          if (value !== "lists") router.push(subjectPath(value));
        }}
      />
      <div className="stickyRankingsRail"><ListBrowseControlsRail query={query} onQueryChange={setQuery} /></div>
      <main className="listBrowse">
        <div className="listBrowseActions"><ListCreateTrigger /></div>
        {listContent}
        {filtered.length > 50 && (
          <div className="listBrowsePager">
            <ListBrowsePagerRail onJumpUp={() => window.scrollTo({ top: 0, behavior: motionSafeScrollBehavior() })} onJumpDown={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: motionSafeScrollBehavior() })} />
          </div>
        )}
      </main>
    </div>
  );
}
