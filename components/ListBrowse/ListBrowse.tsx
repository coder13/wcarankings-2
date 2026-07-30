"use client";

import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader/AppHeader";
import { ExplorerSubjectSwitch, type NavigationSubject } from "@/components/ExplorerSubjectSwitch/ExplorerSubjectSwitch";
import { ListBrowseControlsRail, ListBrowsePagerRail } from "@/components/RankingsRail/RankingsRail";
import type { PublicListSummary } from "@/lib/lists";
import { ListRow } from "./ListRow";
import { ListCreateTrigger } from "@/components/ListOwnerControls/ListOwnerControls";
import "./ListBrowse.css";

const ROW_HEIGHT = 65;
const LISTS_PAGE_SIZE = 50;

export function ListBrowse({ lists }: { lists: PublicListSummary[] }) {
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return search ? lists.filter((list) => `${list.name} ${list.createdBy ?? ""}`.toLocaleLowerCase().includes(search)) : lists;
  }, [lists, query]);
  const virtualizer = useWindowVirtualizer({ count: filtered.length, estimateSize: () => ROW_HEIGHT, overscan: 12 });
  const virtualRows = virtualizer.getVirtualItems();
  const changeSubject = (value: NavigationSubject) => {
    if (value === "lists") return;
    window.location.assign(
      value === "people" ? "/" : value === "competitions" ? "/competitions/best-result" : "/results",
    );
  };
  return (
    <div className="app">
      <AppHeader>
        <ExplorerSubjectSwitch subject="lists" onChange={changeSubject} variant="text" />
      </AppHeader>
      <div className="stickyRankingsRail"><ListBrowseControlsRail query={query} onQueryChange={setQuery} /></div>
      <main className="listBrowse">
        <div className="listBrowseActions">
          <ListCreateTrigger />
        </div>
        {filtered.length ? (
          <ol ref={listRef} className="listBrowseList" style={{ height: `${virtualizer.getTotalSize()}px` }}>
            {virtualRows.map((row) => (
              <div key={row.key} style={{ transform: `translateY(${row.start}px)` }} className="virtualRow">
                <ListRow list={filtered[row.index]!} alternate={row.index % 2 === 1} />
              </div>
            ))}
          </ol>
        ) : <p className="listBrowseEmpty">No public lists match “{query}”.</p>}
        {filtered.length > LISTS_PAGE_SIZE && (
          <div className="listBrowsePager">
            <ListBrowsePagerRail onJumpUp={() => window.scrollTo({ top: 0, behavior: "smooth" })} onJumpDown={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" })} />
          </div>
        )}
      </main>
    </div>
  );
}
