"use client";

import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/AppHeader/AppHeader";
import { ListBrowseControlsRail, ListBrowsePagerRail } from "@/components/RankingsRail/RankingsRail";
import type { PublicListSummary } from "@/lib/lists";
import { ListRow } from "./ListRow";
import { ListCreateTrigger } from "@/components/ListOwnerControls/ListOwnerControls";
import "./ListBrowse.css";
import { subjectPath } from "@/components/RankingsExplorer/helpers/navigation";

export function ListBrowse({ lists }: { lists: PublicListSummary[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return search ? lists.filter((list) => `${list.name} ${list.createdBy ?? ""}`.toLocaleLowerCase().includes(search)) : lists;
  }, [lists, query]);
  const virtualizer = useWindowVirtualizer({ count: filtered.length, estimateSize: () => 65, overscan: 12 });
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
        <div className="listBrowseActions">
          <ListCreateTrigger />
        </div>
        {filtered.length ? (
          <ol className="listBrowseList" style={{ height: `${virtualizer.getTotalSize()}px` }}>
            {virtualizer.getVirtualItems().map((row) => (
              <div key={row.key} style={{ transform: `translateY(${row.start}px)` }} className="virtualRow">
                <ListRow list={filtered[row.index]!} index={row.index} />
              </div>
            ))}
          </ol>
        ) : <p className="listBrowseEmpty">No public lists match “{query}”.</p>}
        {filtered.length > 50 && (
          <div className="listBrowsePager">
            <ListBrowsePagerRail onJumpUp={() => window.scrollTo({ top: 0, behavior: "smooth" })} onJumpDown={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" })} />
          </div>
        )}
      </main>
    </div>
  );
}
