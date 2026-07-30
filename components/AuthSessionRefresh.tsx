"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

type AuthProfileResponse = {
  profile: { wcaId: string } | null;
};

/**
 * Server-rendered list permissions need a fresh RSC payload after OAuth changes
 * the browser session. This also covers a page restored from the back/forward
 * cache, where React effects do not mount again.
 */
export function AuthSessionRefresh() {
  const router = useRouter();
  const knownIdentity = useRef<string | null | undefined>(undefined);
  const sessionCheckVersion = useRef(0);

  const refreshIfSessionChanged = useCallback(async () => {
    const checkVersion = ++sessionCheckVersion.current;
    try {
      const response = await fetch("/api/auth/wca/me", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return;
      const { profile } = await response.json() as AuthProfileResponse;
      if (checkVersion !== sessionCheckVersion.current) return;
      const identity = profile?.wcaId ?? null;

      if (knownIdentity.current !== undefined && knownIdentity.current !== identity) {
        knownIdentity.current = identity;
        router.refresh();
        return;
      }
      knownIdentity.current = identity;
    } catch {
      // Authentication UI will surface the next successful session check.
    }
  }, [router]);

  useEffect(() => {
    void refreshIfSessionChanged();
    const onPageShow = () => void refreshIfSessionChanged();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refreshIfSessionChanged();
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refreshIfSessionChanged]);

  return null;
}
