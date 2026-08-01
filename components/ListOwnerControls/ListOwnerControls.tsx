"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";
import { listPath } from "@/lib/helpers/lists/list-path";
import { useRouter } from "next/navigation";
import { ListCreateDialog } from "./ListCreateDialog";

export { ListAddPeopleRail } from "./ListAddPeopleRail";
export { ListMembershipControls } from "./ListMembershipControls";
export {
  ListMembershipRequestRows,
  type MembershipRequest,
} from "./ListMembershipRequestRows";

export function ListCreateTrigger() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="listActionLink"
        type="button"
        onPointerDown={() => setOpen(true)}
        onClick={() => setOpen(true)}
      >
        Create a list
      </button>
      {open && <ListCreateDialog onClose={() => setOpen(false)} />}
    </>
  );
}

export function ListOwnerControls({
  listId,
  initialVisibility,
  initialJoinPolicy = "closed",
  onManageMembers,
}: {
  listId: string;
  initialVisibility: "public" | "private";
  initialJoinPolicy?: "open" | "closed";
  onManageMembers?: () => void;
}) {
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [visibility, setVisibility] = useState(initialVisibility);
  const [joinPolicy, setJoinPolicy] = useState(initialJoinPolicy);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!settingsOpen) return;
    const close = (event: MouseEvent) => {
      if (!settingsRef.current?.contains(event.target as Node)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [settingsOpen]);

  const save = async (change: {
    visibility?: "public" | "private";
    joinPolicy?: "open" | "closed";
  }) => {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/lists/${listId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(change),
    });
    if (!response.ok) {
      setError("Could not update this list.");
      setBusy(false);
      return;
    }
    if (change.visibility) setVisibility(change.visibility);
    if (change.joinPolicy) setJoinPolicy(change.joinPolicy);
    setBusy(false);
    setSettingsOpen(false);
    router.refresh();
  };

  const duplicate = async () => {
    setBusy(true);
    const response = await fetch(`/api/lists/${listId}`, { method: "POST" });
    const body = await response.json() as {
      list?: { publicId: string; slug: string };
    };
    if (response.ok && body.list?.publicId) {
      router.push(listPath({
        publicId: body.list.publicId,
        systemAlias: null,
        slug: body.list.slug,
      }));
      return;
    }
    setBusy(false);
  };

  return (
    <div className="listOwnerControls" ref={settingsRef}>
      <button
        type="button"
        onClick={() => setSettingsOpen((open) => !open)}
        aria-label="List settings"
      >
        ⋮
      </button>
      {settingsOpen && (
        <div className="listSettingsMenu" role="menu">
          <button
            type="button"
            onClick={() => {
              onManageMembers?.();
              setSettingsOpen(false);
            }}
          >
            Manage members
          </button>
          <a href={`/api/lists/${listId}?format=csv`}>Export CSV</a>
          <button
            type="button"
            disabled={busy}
            onClick={() => void duplicate()}
          >
            {busy ? "Duplicating…" : "Duplicate list"}
          </button>
          <label>
            <input
              type="checkbox"
              checked={visibility === "private"}
              disabled={busy}
              onChange={(event) => void save({
                visibility: event.target.checked ? "private" : "public",
              })}
            />
            Private
          </label>
          <label>
            <input
              type="checkbox"
              checked={joinPolicy === "open"}
              disabled={busy}
              onChange={(event) => void save({
                joinPolicy: event.target.checked ? "open" : "closed",
              })}
            />
            Open to join
          </label>
          {error && <p role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
