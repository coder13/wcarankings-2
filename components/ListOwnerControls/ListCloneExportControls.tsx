"use client";

import { useState } from "react";
import { listPath } from "@/lib/list-path";

export function ListCloneExportControls({ listId }: { listId: string }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const clone = async () => {
    setBusy(true);
    const response = await fetch(`/api/lists/${listId}`, { method: "POST" });
    const body = await response.json() as { list?: { publicId: string; slug: string } };
    if (response.ok && body.list?.publicId) {
      window.location.assign(listPath({ publicId: body.list.publicId, systemAlias: null, slug: body.list.slug }));
      return;
    }
    setBusy(false);
  };

  return (
    <div className="listCloneExportControls">
      <button type="button" aria-label="List actions" onClick={() => setOpen((current) => !current)}>⋮</button>
      {open && <div className="listSettingsMenu" role="menu">
        <a href={`/api/lists/${listId}?format=csv`}>Export CSV</a>
        <button type="button" disabled={busy} onClick={() => void clone()}>
          {busy ? "Cloning…" : "Clone list"}
        </button>
      </div>}
    </div>
  );
}
