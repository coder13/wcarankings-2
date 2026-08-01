"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { listPath } from "@/lib/list-path";

type CreatedList = { publicId: string; slug: string };

export function ListCreateDialog({
  onClose,
  initialName = "",
  personIds = [],
}: {
  onClose: () => void;
  initialName?: string;
  personIds?: string[];
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [joinPolicy, setJoinPolicy] = useState<"open" | "closed">("closed");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ list: CreatedList; invalid: string[]; blocked: string[] } | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, visibility, joinPolicy, personIds }),
    });
    if (response.status === 401) {
      window.location.assign("/api/auth/wca");
      return;
    }
    const body = await response.json() as { list?: CreatedList; invalid?: string[]; blocked?: string[]; error?: string };
    if (!response.ok || !body.list?.publicId) {
      setError(body.error ?? "Could not create this list.");
      setBusy(false);
      return;
    }
    if (!(body.invalid?.length ?? 0) && !(body.blocked?.length ?? 0)) {
      router.push(listPath({
        publicId: body.list.publicId,
        systemAlias: null,
        slug: body.list.slug,
      }));
      return;
    }
    setCreated({ list: body.list, invalid: body.invalid ?? [], blocked: body.blocked ?? [] });
    setBusy(false);
  };

  const skippedCount = created
    ? created.invalid.length + created.blocked.length
    : 0;

  return (
    <div
      className="listModalBackdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="listModal"
        role="dialog"
        aria-modal="true"
        aria-label="Create a list"
      >
        <div className="listModalHeading">
          <h2>Create a list</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Create a list"
          >
            ×
          </button>
        </div>

        {created ? (
          <div className="listModalForm">
            <p>
              List created. {skippedCount}{" "}
              {skippedCount === 1 ? "person could" : "people could"} not be
              added.
            </p>
            {created.invalid.length > 0 && (
              <p>Unknown: {created.invalid.join(", ")}</p>
            )}
            {created.blocked.length > 0 && (
              <p>Opted out: {created.blocked.join(", ")}</p>
            )}
            <button
              type="button"
              onClick={() => router.push(listPath({
                publicId: created.list.publicId,
                systemAlias: null,
                slug: created.list.slug,
              }))}
            >
              View list
            </button>
          </div>
        ) : (
          <form className="listModalForm" onSubmit={submit}>
            <label>
              Name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={100}
                autoFocus
              />
            </label>
            <fieldset>
              <legend>Visibility</legend>
              <label>
                <input
                  type="radio"
                  checked={visibility === "public"}
                  onChange={() => setVisibility("public")}
                />
                Public
              </label>
              <label>
                <input
                  type="radio"
                  checked={visibility === "private"}
                  onChange={() => setVisibility("private")}
                />
                Private
              </label>
            </fieldset>
            <fieldset>
              <legend>Joining</legend>
              <label>
                <input
                  type="radio"
                  checked={joinPolicy === "open"}
                  onChange={() => setJoinPolicy("open")}
                />
                Anyone can join
              </label>
              <label>
                <input
                  type="radio"
                  checked={joinPolicy === "closed"}
                  onChange={() => setJoinPolicy("closed")}
                />
                Requests need approval
              </label>
            </fieldset>
            {personIds.length > 0 && (
              <p>{personIds.length} people will be added.</p>
            )}
            {error && (
              <p className="listModalError" role="alert">{error}</p>
            )}
            <button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create list"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
