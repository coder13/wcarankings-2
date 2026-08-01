"use client";

import { ListCreateTrigger } from "@/components/ListOwnerControls/ListOwnerControls";
import { AppHeader } from "@/components/AppHeader/AppHeader";
import { ListRow } from "@/components/ListBrowse/ListRow";
import type { ListSummary } from "@/lib/lists";
import "@/components/ListBrowse/ListBrowse.css";
import { useRouter } from "next/navigation";
import { subjectPath } from "@/components/RankingsExplorer/helpers/navigation";

export function ListMine({ lists }: { lists: ListSummary[] }) {
  const router = useRouter();
  return (
    <div className="app">
      <AppHeader
        subject="lists"
        onSubjectChange={(value) => {
          router.push(value === "lists" ? "/lists" : subjectPath(value));
        }}
      />
      <main className="listBrowse">
        <div className="listMineHeading">
          <div>
            <h2>My lists</h2>
            <p>Lists you created.</p>
          </div>
          {lists.length > 0 && <ListCreateTrigger />}
        </div>
        {lists.length ? (
          <ol className="listBrowseList">
            {lists.map((list, index) => (
              <ListRow
                key={list.id}
                list={list}
                index={index}
              />
            ))}
          </ol>
        ) : (
          <div className="listMineEmpty">
            <p>You have not created any lists yet.</p>
            <ListCreateTrigger />
          </div>
        )}
      </main>
    </div>
  );
}
