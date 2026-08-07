"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { AdminPage } from "@/components/AdminPage/AdminPage";
import styles from "@/components/AdminHealth/AdminHealth.module.css";

async function loadSettings() {
  const response = await fetch("/api/admin/live/settings", {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Live-results settings are unavailable.");
  return (await response.json()) as { pollSeconds: number };
}

export function LiveResultsSettings() {
  const [pollMinutes, setPollMinutes] = useState(60);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadSettings()
      .then(({ pollSeconds }) => setPollMinutes(pollSeconds / 60))
      .catch((error: unknown) =>
        setMessage(
          error instanceof Error
            ? error.message
            : "Live-results settings are unavailable.",
        ),
      );
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const pollSeconds = pollMinutes * 60;
    if (
      !Number.isInteger(pollSeconds) ||
      pollSeconds < 60 ||
      pollSeconds > 86_400
    ) {
      setMessage("Enter a whole number of minutes from 1 through 1440.");
      return;
    }
    if (
      !window.confirm(
        `Change the live-results poll interval to ${pollMinutes} minutes?`,
      )
    )
      return;
    setSaving(true);
    try {
      const response = await fetch("/api/admin/live/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pollSeconds, confirmed: true }),
      });
      const payload = (await response.json()) as {
        pollSeconds?: number;
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error ?? "Settings could not be saved.");
      setPollMinutes((payload.pollSeconds ?? pollSeconds) / 60);
      setMessage("Saved. The poller applies this setting within one minute.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Settings could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPage
      title="Live results settings"
      description="Configuration for active live-results polling."
      aside={
        <Link href="/admin/live" className={styles.status}>
          Back to live results
        </Link>
      }
    >
      {message && <p className={styles.alert}>{message}</p>}
      <section className={styles.card} aria-labelledby="polling-heading">
        <h2 id="polling-heading">Polling</h2>
        <form className={styles.settingsForm} onSubmit={save}>
          <label className={styles.settingsField}>
            <span>Poll interval (minutes)</span>
            <input
              type="number"
              min="1"
              max="1440"
              step="1"
              value={pollMinutes}
              onChange={(event) => setPollMinutes(Number(event.target.value))}
            />
          </label>
          <p>
            Production default: 60 minutes. Use 15 minutes for local
            development. Active WCA Live sources apply the new interval within
            one minute.
          </p>
          <button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save poll interval"}
          </button>
        </form>
      </section>
    </AdminPage>
  );
}
