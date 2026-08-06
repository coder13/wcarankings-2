"use client";

import { useState } from "react";
import { Checkbox } from "@/components/Checkbox";

type MembershipRequest = {
  id: number;
  personId: string;
  name: string;
  status?: "pending" | "accepted" | "rejected" | "cancelled";
};

export function ListMembershipRequestRows({
  listId,
  initialRequests,
}: {
  listId: string;
  initialRequests: Array<Pick<MembershipRequest, "id" | "personId" | "name">>;
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [selectedRequestIds, setSelectedRequestIds] = useState<number[]>([]);
  const [lastSelectedRequestIndex, setLastSelectedRequestIndex] = useState<
    number | null
  >(null);
  const [busy, setBusy] = useState(false);

  const decide = async (
    requestIds: number[],
    decision: "accepted" | "rejected",
  ) => {
    if (!requestIds.length) return;
    setBusy(true);
    const results = await Promise.all(requestIds.map(async (requestId) => {
      const response = await fetch(
        `/api/lists/${listId}/requests/${requestId}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision }),
        },
      );
      const body = await response.json() as { error?: string };
      return { requestId, response, body };
    }));
    const resolvedRequestIds = results
      .filter(({ response, body }) =>
        response.ok ||
        body.error === "This membership request is no longer pending."
      )
      .map(({ requestId }) => requestId);
    if (resolvedRequestIds.length) {
      setRequests((current) => current.filter(
        (request) => !resolvedRequestIds.includes(request.id),
      ));
      setSelectedRequestIds((current) => current.filter(
        (requestId) => !resolvedRequestIds.includes(requestId),
      ));
    }
    setBusy(false);
  };

  const toggleSelection = (index: number, shiftKey: boolean) => {
    setSelectedRequestIds((current) => {
      const requestId = requests[index]!.id;
      const checked = !current.includes(requestId);
      if (!shiftKey || lastSelectedRequestIndex === null) {
        return checked
          ? [...current, requestId]
          : current.filter((id) => id !== requestId);
      }
      const range = requests
        .slice(
          Math.min(lastSelectedRequestIndex, index),
          Math.max(lastSelectedRequestIndex, index) + 1,
        )
        .map((request) => request.id);
      return checked
        ? [...new Set([...current, ...range])]
        : current.filter((id) => !range.includes(id));
    });
    setLastSelectedRequestIndex(index);
  };

  if (!requests.length) return null;
  const hasSelectedRequests = selectedRequestIds.length > 0;
  return (
    <>
      <section
        className="listMembershipRequests"
        aria-label="Membership requests"
      >
        <div className="listMembershipRequestHeading">
          <h2>Membership requests</h2>
          <div
            className="listMembershipRequestBulkActions"
            aria-hidden={!hasSelectedRequests}
          >
            <button
              type="button"
              tabIndex={hasSelectedRequests ? 0 : -1}
              disabled={busy}
              onClick={() => void decide(selectedRequestIds, "rejected")}
            >
              Reject selected
            </button>
            <button
              type="button"
              tabIndex={hasSelectedRequests ? 0 : -1}
              disabled={busy}
              onClick={() => void decide(selectedRequestIds, "accepted")}
            >
              Accept selected
            </button>
          </div>
        </div>
        {requests.map((request, index) => (
          <div className="listMembershipRequest" key={request.id}>
            <label
              className="listMembershipRequestSelection"
              onClick={(event) => {
                event.preventDefault();
                toggleSelection(index, event.shiftKey);
              }}
            >
              <Checkbox
                checked={selectedRequestIds.includes(request.id)}
                readOnly
                aria-label={`Select ${request.name}`}
              />
              <span>
                <strong>{request.name}</strong>
                <small>{request.personId}</small>
              </span>
            </label>
            <div className="listMembershipRequestActions">
              <button
                type="button"
                disabled={busy}
                onClick={() => void decide([request.id], "rejected")}
              >
                Reject
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void decide([request.id], "accepted")}
              >
                Accept
              </button>
            </div>
          </div>
        ))}
      </section>
      <div className="listMembershipRequestsDivider" aria-hidden="true" />
    </>
  );
}
