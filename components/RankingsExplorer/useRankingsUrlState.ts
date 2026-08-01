"use client";

import { useCallback, useEffect, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { notifyAnalyticsNavigation } from "@/lib/helpers/analytics/google-analytics";
import {
  parseRankingsUrl,
  serializeRankingsUrl,
  type RankingsUrlNavigation,
  type RankingsUrlUpdate,
} from "./rankingsUrl";

export type {
  RankingsUrlNavigation,
  RankingsUrlState,
  RankingsUrlUpdate,
} from "./rankingsUrl";

export function useRankingsUrlState() {
  const pathname = usePathname();
  const searchString = useSearchParams().toString();
  const state = useMemo(
    () => parseRankingsUrl(pathname, new URLSearchParams(searchString)),
    [pathname, searchString],
  );

  const write = useCallback((
    update: RankingsUrlUpdate,
    navigation: RankingsUrlNavigation = {},
  ) => {
    const nextPathname = navigation.pathname ?? window.location.pathname;
    const query = serializeRankingsUrl(
      nextPathname,
      { ...state, ...update },
    ).toString();
    const href = query ? `${nextPathname}?${query}` : nextPathname;
    window.history[navigation.history === "push" ? "pushState" : "replaceState"](
      window.history.state,
      "",
      href,
    );
    notifyAnalyticsNavigation();
  }, [state]);

  useEffect(() => {
    const canonical = serializeRankingsUrl(pathname, state).toString();
    if (canonical === searchString) return;
    const href = canonical ? `${pathname}?${canonical}` : pathname;
    window.history.replaceState(window.history.state, "", href);
    notifyAnalyticsNavigation();
  }, [pathname, searchString, state]);

  return { state, write, key: `${pathname}?${searchString}` };
}
