"use client";

import { useState } from "react";
import { ListCreateDialog } from "./ListCreateDialog";

export function DynamicListControls({ personIds }: { personIds: string[] }) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  return <div className="listCloneExportControls"><button type="button" aria-label="List actions" onClick={() => setOpen((current) => !current)}>⋮</button>{open && <div className="listSettingsMenu" role="menu"><button type="button" onClick={() => { setOpen(false); setCreating(true); }}>Save as list</button></div>}{creating && <ListCreateDialog personIds={personIds} onClose={() => setCreating(false)} />}</div>;
}
