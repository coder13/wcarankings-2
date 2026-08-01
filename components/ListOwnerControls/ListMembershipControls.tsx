"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ListDialog } from "./shared";

export function ListMembershipControls({
  listId,
  joinPolicy,
  initialState,
}: {
  listId: string;
  joinPolicy: "open" | "closed";
  initialState: "member" | "pending" | "not_member";
}) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [busy, setBusy] = useState(false);

  const requestMembership = async () => {
    setBusy(true);
    const response = await fetch(`/api/lists/${listId}/requests`, {
      method: "POST",
    });
    if (!response.ok) {
      setBusy(false);
      return;
    }
    const { status } = await response.json() as {
      status: "joined" | "pending";
    };
    setState(status === "joined" ? "member" : "pending");
    setBusy(false);
    router.refresh();
  };

  const removeMembership = async () => {
    setBusy(true);
    const response = await fetch(`/api/lists/${listId}/members/me`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setBusy(false);
      return;
    }
    setState("not_member");
    setConfirmingRemoval(false);
    setBusy(false);
    router.refresh();
  };

  let joinLabel = joinPolicy === "open" ? "Join list" : "Request to join";
  if (busy) joinLabel = "Joining…";

  let action = (
    <button
      type="button"
      disabled={busy}
      onClick={() => void requestMembership()}
    >
      {joinLabel}
    </button>
  );
  if (state === "member") {
    action = (
      <button type="button" onClick={() => setConfirmingRemoval(true)}>
        Remove myself
      </button>
    );
  } else if (state === "pending") {
    action = <button type="button" disabled>Request pending</button>;
  }

  return (
    <div className="listMembershipControls">
      {action}
      {confirmingRemoval && (
        <ListDialog
          title="Remove yourself"
          onClose={() => {
            if (!busy) setConfirmingRemoval(false);
          }}
        >
          <div className="listModalForm">
            <p>Remove yourself from this list?</p>
            <div className="listRemovalActions">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmingRemoval(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void removeMembership()}
              >
                {busy ? "Removing…" : "Remove myself"}
              </button>
            </div>
          </div>
        </ListDialog>
      )}
    </div>
  );
}
