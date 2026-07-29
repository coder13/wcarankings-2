"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { AppHeader } from "@/components/AppHeader/AppHeader";
import {
  ExplorerSubjectSwitch,
  type NavigationSubject,
} from "@/components/ExplorerSubjectSwitch/ExplorerSubjectSwitch";
import "./ListCreate.css";

type CreatedList = {
  publicId: string | null;
};

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

type AuthResponse = { profile: { wcaId: string } | null };

export function ListCreate({ signedIn: initialSignedIn }: { signedIn?: boolean }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(initialSignedIn ?? null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [memberIds, setMemberIds] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (initialSignedIn !== undefined) return;
    const controller = new AbortController();
    fetch("/api/auth/wca/me", { headers: { Accept: "application/json" }, signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load profile");
        const body = await response.json() as AuthResponse;
        setSignedIn(Boolean(body.profile));
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setSignedIn(false);
      });
    return () => controller.abort();
  }, [initialSignedIn]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const personIds = memberIds.split(/[\s,]+/).filter(Boolean);
      const response = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ name, description, visibility }),
      });
      const body = await response.json() as { list?: CreatedList; error?: string };
      if (!response.ok || !body.list?.publicId) {
        throw new Error(body.error ?? "Could not create this list.");
      }
      if (personIds.length > 0) {
        const membersResponse = await fetch(`/api/lists/${body.list.publicId}/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ personIds }),
        });
        if (!membersResponse.ok) {
          const membersBody = await membersResponse.json() as { error?: string };
          throw new Error(membersBody.error ?? "Your list was created, but its members could not be added.");
        }
      }
      window.location.assign(`/lists/${body.list.publicId}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create this list.");
      setSubmitting(false);
    }
  };

  return (
    <div className="app">
      <AppHeader>
        <ExplorerSubjectSwitch subject="lists" onChange={changeSubject} variant="text" />
      </AppHeader>
      <main className="listCreate">
        <div className="listCreateCard">
          <Link className="listCreateBack" href="/lists">‹ All lists</Link>
          <h2>Create a list</h2>
          <p className="listCreateIntro">Make a list of WCA competitors, then add people by WCA ID.</p>
          {signedIn === null ? <p className="listCreateLoading" role="status">Loading your account…</p> : signedIn ? (
            <form className="listCreateForm" onSubmit={submit}>
              <label>
                <span>Name</span>
                <input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required autoFocus />
              </label>
              <label>
                <span>Description <em>(optional)</em></span>
                <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} rows={3} />
              </label>
              <label>
                <span>WCA IDs <em>(optional; separate with spaces, commas, or lines)</em></span>
                <textarea value={memberIds} onChange={(event) => setMemberIds(event.target.value)} placeholder={"2016EXAM01\n2018EXAM02"} rows={4} spellCheck={false} />
              </label>
              <fieldset>
                <legend>Visibility</legend>
                <label className="listCreateChoice">
                  <input type="radio" name="visibility" checked={visibility === "public"} onChange={() => setVisibility("public")} />
                  <span><strong>Public</strong><small>Anyone can view it and its rankings.</small></span>
                </label>
                <label className="listCreateChoice">
                  <input type="radio" name="visibility" checked={visibility === "private"} onChange={() => setVisibility("private")} />
                  <span><strong>Private</strong><small>Only you can view it.</small></span>
                </label>
              </fieldset>
              {error && <p className="listCreateError" role="alert">{error}</p>}
              <button type="submit" disabled={submitting}>{submitting ? "Creating…" : "Create list"}</button>
            </form>
          ) : (
            <div className="listCreateSignIn">
              <p>Sign in with your WCA account to create and manage a list.</p>
              <a href="/api/auth/wca">Sign in with WCA</a>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
