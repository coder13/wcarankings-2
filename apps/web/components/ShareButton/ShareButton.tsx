"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./ShareButton.module.css";

type NativeShare = (data: { title?: string; url?: string }) => Promise<void>;
type ClipboardWrite = (text: string) => Promise<void>;

export type ShareListUrlResult = "shared" | "copied" | "cancelled";

export function shouldShowListShare({
  hasList,
  searchOpen,
  searchQuery,
  regexSearch,
}: {
  hasList: boolean;
  searchOpen: boolean;
  searchQuery: string;
  regexSearch: boolean;
}) {
  return hasList && !searchOpen && !searchQuery.trim() && !regexSearch;
}

function isAbortError(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "name" in error &&
    error.name === "AbortError",
  );
}

export async function shareListUrl({
  url,
  title,
  share,
  writeText,
}: {
  url: string;
  title: string;
  share?: NativeShare;
  writeText?: ClipboardWrite;
}): Promise<ShareListUrlResult> {
  if (share) {
    try {
      await share({ title, url });
      return "shared";
    } catch (error) {
      if (isAbortError(error)) return "cancelled";
    }
  }

  if (!writeText) throw new Error("Sharing is unavailable.");
  await writeText(url);
  return "copied";
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5" />
    </svg>
  );
}

export function ShareButton({ title }: { title: string }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (statusTimer.current) clearTimeout(statusTimer.current);
    },
    [],
  );

  const announce = (message: string) => {
    setStatus(message);
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus(""), 3000);
  };

  const handleShare = async () => {
    setBusy(true);
    setStatus("");
    try {
      const result = await shareListUrl({
        url: window.location.href,
        title,
        share:
          typeof navigator.share === "function"
            ? navigator.share.bind(navigator)
            : undefined,
        writeText:
          typeof navigator.clipboard?.writeText === "function"
            ? navigator.clipboard.writeText.bind(navigator.clipboard)
            : undefined,
      });
      if (result === "shared") announce("List shared.");
      if (result === "copied") announce("List link copied.");
    } catch {
      announce("Could not share this list.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        className={styles.shareButton}
        type="button"
        aria-label="Share this list"
        title="Share this list"
        aria-busy={busy || undefined}
        disabled={busy}
        onClick={handleShare}
      >
        <ShareIcon />
      </button>
      <span className="visuallyHidden" role="status" aria-live="polite">
        {status}
      </span>
    </>
  );
}
