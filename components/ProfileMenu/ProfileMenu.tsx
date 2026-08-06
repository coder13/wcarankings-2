"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useWcaProfile } from "../Auth/useWcaProfile";

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

export function ProfileMenu() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const profileQuery = useWcaProfile();
  const state =
    profileQuery.data ??
    (profileQuery.isError ? { profile: null, configured: true } : null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        rootRef.current
          ?.querySelector<HTMLButtonElement>(".profileButton")
          ?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const profile = state?.profile ?? null;
  const label = profile
    ? `Open profile menu for ${profile.name}`
    : "Open profile menu";
  const avatar = profile?.avatarUrl ? (
    // WCA controls this authenticated profile URL; preserving it avoids proxying user avatars.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={profile.avatarUrl} alt="" referrerPolicy="no-referrer" />
  ) : (
    <PersonIcon />
  );

  let menuContent = (
    <p className="profileStatus" role="status">
      Loading profile…
    </p>
  );
  if (state && profile) {
    menuContent = (
      <>
        <div className="profileIdentity">
          <strong>{profile.name}</strong>
          <span>{profile.wcaId}</span>
        </div>
        <Link role="menuitem" href="/lists/mine">
          My lists
        </Link>
        <form action="/api/auth/wca/logout" method="post">
          <button role="menuitem" type="submit">
            Sign out
          </button>
        </form>
      </>
    );
  } else if (state?.configured) {
    menuContent = (
      <a role="menuitem" href="/api/auth/wca">
        Sign in with WCA
      </a>
    );
  } else if (state) {
    menuContent = (
      <p className="profileStatus">WCA sign-in is not configured.</p>
    );
  }

  return (
    <div className="profileMenu" ref={rootRef}>
      <button
        className="profileButton"
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {avatar}
      </button>

      {open && (
        <div className="profilePopover" role="menu">
          {menuContent}
        </div>
      )}
    </div>
  );
}
