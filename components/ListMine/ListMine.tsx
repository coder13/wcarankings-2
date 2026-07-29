"use client";

import Link from "next/link";
import { AppHeader } from "@/components/AppHeader/AppHeader";
import {
  ExplorerSubjectSwitch,
  type NavigationSubject,
} from "@/components/ExplorerSubjectSwitch/ExplorerSubjectSwitch";
import { ListRow } from "@/components/ListBrowse/ListRow";
import type { ListSummary, PublicListSummary } from "@/lib/lists";
import "@/components/ListBrowse/ListBrowse.css";
import "./ListMine.css";

function changeSubject(value: NavigationSubject) {
  window.location.assign(
    value === "lists"
      ? "/lists"
      : value === "people"
        ? "/"
        : value === "competitions"
          ? "/competitions/best-result"
          : "/results",
  );
}

function asRow(list: ListSummary): PublicListSummary {
  return {
    publicId: list.publicId,
    systemAlias: list.systemAlias,
    name: list.name,
    memberCount: list.memberCount,
    kind: list.kind,
    createdBy: null,
  };
}

export function ListMine({ lists }: { lists: ListSummary[] }) {
  return (
    <div className="app">
      <AppHeader>
        <ExplorerSubjectSwitch subject="lists" onChange={changeSubject} variant="text" />
      </AppHeader>
      <main className="listBrowse">
        <div className="listMineHeading">
          <div>
            <h2>My lists</h2>
            <p>Lists you created.</p>
          </div>
          <Link href="/lists/new">Create a list</Link>
        </div>
        {lists.length ? (
          <ol className="listBrowseList">
            {lists.map((list, index) => (
              <ListRow
                key={list.id}
                list={asRow(list)}
                alternate={index % 2 === 1}
                subtitle={list.visibility === "public" ? "Public" : "Private"}
              />
            ))}
          </ol>
        ) : (
          <div className="listMineEmpty">
            <p>You have not created any lists yet.</p>
            <Link href="/lists/new">Create your first list</Link>
          </div>
        )}
      </main>
    </div>
  );
}
