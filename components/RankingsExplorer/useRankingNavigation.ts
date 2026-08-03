"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWcaProfile } from "../Auth/useWcaProfile";
import type { RankingsFilterState } from "./rankingsUrl";
import type { useRankingsUrlState } from "./useRankingsUrlState";
import type { RankingDataSource } from "./useRankingDataSource";
import type { RankingEntry } from "./types";
import type { useVirtualRankings } from "./useVirtualRankings";

type NavigationUrl = {
  state: Pick<
    ReturnType<typeof useRankingsUrlState>["state"],
    "focusMe" | "wcaId"
  >;
  write: ReturnType<typeof useRankingsUrlState>["write"];
};

export function useRankingNavigation({
  filters,
  dataSource,
  rankings,
  url,
}: {
  filters: RankingsFilterState;
  dataSource: RankingDataSource;
  rankings: ReturnType<typeof useVirtualRankings>;
  url: NavigationUrl;
}) {
  const [ui, setUi] = useState({
    highlightedPersonId: "",
    focusNotice: "",
    error: "",
  });
  const requestEpochRef = useRef(0);
  const lastFocusRequestRef = useRef("");
  const profileQuery = useWcaProfile(
    filters.subject === "people" && url.state.focusMe,
  );

  const clearFocus = useCallback(() => {
    if (rankings.expandedIndex !== null) {
      rankings.toggleExpanded(rankings.expandedIndex);
    }
    setUi((current) => ({
      ...current,
      highlightedPersonId: "",
      focusNotice: "",
    }));
    if (url.state.wcaId || url.state.focusMe) {
      url.write({ wcaId: "", focusMe: false });
    }
  }, [rankings, url]);

  const resetToRank = useCallback((rank: number, animate = true) => {
    clearFocus();
    rankings.jumpToIndex(rank - 1, animate);
  }, [clearFocus, rankings]);
  const getCurrentRank = useCallback(
    () => rankings.currentIndex + 1,
    [rankings.currentIndex],
  );
  const jumpToEnd = useCallback(() => {
    resetToRank(rankings.total);
  }, [rankings.total, resetToRank]);
  const jumpUp = useCallback(() => {
    const current = getCurrentRank();
    resetToRank(current <= 5_000 ? 1 : current - 5_000);
  }, [getCurrentRank, resetToRank]);
  const jumpDown = useCallback(() => {
    const current = getCurrentRank();
    resetToRank(
      current >= rankings.total - 5_000
        ? rankings.total
        : current + 5_000,
    );
  }, [getCurrentRank, rankings.total, resetToRank]);

  const jumpToEntry = useCallback((entry: RankingEntry) => {
    setUi((current) => ({
      ...current,
      error: "",
      highlightedPersonId: entry.personId,
    }));
    rankings.jumpToIndex(entry.subRank - 1);
  }, [rankings]);
  const clearHighlight = useCallback(() => {
    setUi((current) => ({ ...current, highlightedPersonId: "" }));
  }, []);

  const focusWcaId = useCallback((wcaId: string, animate = true) => {
    if (filters.subject !== "people") return;
    const requestEpoch = requestEpochRef.current + 1;
    requestEpochRef.current = requestEpoch;
    void dataSource.requests.locateRanking(wcaId)
      .then(({ located }) => {
        if (requestEpoch !== requestEpochRef.current) return;
        if (!located) {
          setUi((current) => ({
            ...current,
            highlightedPersonId: "",
            focusNotice:
              "That person is not ranked for the selected event or filters.",
          }));
          rankings.jumpToIndex(0, false);
          return;
        }
        const targetIndex = Math.max(0, located.subRank - 1);
        setUi((current) => ({
          ...current,
          highlightedPersonId: located.personId,
          focusNotice: "",
        }));
        rankings.expandIndex(targetIndex);
        rankings.jumpToIndex(targetIndex, animate);
      })
      .catch((error: unknown) => {
        if (requestEpoch !== requestEpochRef.current) return;
        setUi((current) => ({
          ...current,
          error: error instanceof Error
            ? error.message
            : "Could not find this person in the rankings.",
        }));
      });
  }, [dataSource.requests, filters.subject, rankings]);

  const focusMyRanking = useCallback((wcaId: string) => {
    url.write({ focusMe: true, wcaId: "" });
    focusWcaId(wcaId);
  }, [focusWcaId, url]);
  const updateFocusedPerson = useCallback((personId: string | null) => {
    if (!personId) {
      setUi((current) => ({
        ...current,
        highlightedPersonId: "",
        focusNotice: "",
      }));
      url.write({ wcaId: "", focusMe: false });
      return;
    }
    setUi((current) => ({
      ...current,
      highlightedPersonId: personId,
      focusNotice: "",
    }));
    url.write({ wcaId: personId, focusMe: false });
  }, [url]);

  const navigateRow = useCallback((globalIndex: number, direction: -1 | 1) => {
    const targetIndex = Math.min(
      rankings.total - 1,
      Math.max(0, globalIndex + direction),
    );
    const selector = `.listItem[data-global-index="${targetIndex}"]`;
    const mounted = document.querySelector<HTMLElement>(selector);
    if (mounted) {
      mounted.focus({ preventScroll: true });
      mounted.scrollIntoView({ block: "nearest" });
      return;
    }
    rankings.jumpToIndex(targetIndex, false);
    let attempts = 4;
    const focusWhenRendered = () => {
      window.requestAnimationFrame(() => {
        const row = document.querySelector<HTMLElement>(selector);
        if (row) {
          row.focus({ preventScroll: true });
          return;
        }
        attempts -= 1;
        if (attempts > 0) focusWhenRendered();
      });
    };
    focusWhenRendered();
  }, [rankings]);

  useEffect(() => {
    if (filters.subject !== "people") return;
    const requestKey = [
      dataSource.listKey,
      url.state.wcaId,
      url.state.focusMe ? "me" : "",
    ].join(":");
    if (
      (!url.state.wcaId && !url.state.focusMe) ||
      lastFocusRequestRef.current === requestKey
    ) {
      return;
    }
    if (url.state.wcaId) {
      lastFocusRequestRef.current = requestKey;
      focusWcaId(url.state.wcaId, false);
      return;
    }
    if (profileQuery.isPending) return;
    lastFocusRequestRef.current = requestKey;
    const profile = profileQuery.data?.profile;
    if (profile) {
      focusWcaId(profile.wcaId, false);
    }
  }, [
    dataSource.listKey,
    filters.subject,
    focusWcaId,
    profileQuery.data,
    profileQuery.error,
    profileQuery.isPending,
    url.state.focusMe,
    url.state.wcaId,
  ]);

  let profileError = "";
  if (
    url.state.focusMe &&
    !profileQuery.isPending &&
    !profileQuery.data?.profile
  ) {
    profileError = profileQuery.error instanceof Error
      ? profileQuery.error.message
      : "Sign in with WCA to jump to your ranking.";
  }

  return useMemo(() => ({
    ...ui,
    error: ui.error || profileError,
    getCurrentRank,
    resetToRank,
    jumpToEnd,
    jumpUp,
    jumpDown,
    jumpToEntry,
    clearHighlight,
    focusMyRanking,
    updateFocusedPerson,
    navigateRow,
  }), [
    clearHighlight,
    focusMyRanking,
    getCurrentRank,
    jumpDown,
    jumpToEnd,
    jumpToEntry,
    jumpUp,
    navigateRow,
    resetToRank,
    ui,
    updateFocusedPerson,
    profileError,
  ]);
}
