"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWcaProfile } from "../Auth/useWcaProfile";
import type { RankingsFilterState } from "./rankingsUrl";
import type { RankingsApi } from "./useRankingsApi";
import type { RankingsState } from "./useRankingsState";
import type { RankingEntry } from "./types";
import type { useVirtualRankings } from "./useVirtualRankings";

type FocusRankings = Pick<
  ReturnType<typeof useVirtualRankings>,
  | "expandedIndex"
  | "toggleExpanded"
  | "expandIndex"
  | "jumpToIndex"
  | "loading"
>;

function focusRequestKey(
  datasetKey: string,
  personId: string,
  focusMe: boolean,
) {
  return [datasetKey, personId, focusMe ? "me" : ""].join(":");
}

export function useRankingFocus({
  filters,
  api,
  rankings,
  url,
}: {
  filters: RankingsFilterState;
  api: RankingsApi;
  rankings: FocusRankings;
  url: RankingsState["url"];
}) {
  const [ui, setUi] = useState({
    highlightedPersonId: "",
    notice: "",
    error: "",
  });
  const requestEpochRef = useRef(0);
  const lastFocusRequestRef = useRef("");
  const profileQuery = useWcaProfile(
    filters.subject === "people" && url.state.focusMe,
  );

  const clear = useCallback(() => {
    if (rankings.expandedIndex !== null) {
      rankings.toggleExpanded(rankings.expandedIndex);
    }
    setUi((current) => ({
      ...current,
      highlightedPersonId: "",
      notice: "",
    }));
    if (url.state.wcaId || url.state.focusMe) {
      url.write({ wcaId: "", focusMe: false });
    }
  }, [rankings, url]);

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
    void api.locate(wcaId)
      .then(({ located }) => {
        if (requestEpoch !== requestEpochRef.current) return;
        if (!located) {
          setUi((current) => ({
            ...current,
            highlightedPersonId: "",
            notice: "That person is not ranked for the selected event or filters.",
          }));
          rankings.jumpToIndex(0, false);
          return;
        }
        const targetIndex = Math.max(0, located.subRank - 1);
        setUi((current) => ({
          ...current,
          highlightedPersonId: located.personId,
          notice: "",
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
  }, [api, filters.subject, rankings]);

  const focusMyRanking = useCallback((wcaId: string) => {
    url.write({ focusMe: true, wcaId: "" });
    focusWcaId(wcaId);
  }, [focusWcaId, url]);

  const updateFocusedPerson = useCallback((personId: string | null) => {
    setUi((current) => ({
      ...current,
      highlightedPersonId: personId ?? "",
      notice: "",
    }));
    if (personId) {
      lastFocusRequestRef.current = focusRequestKey(
        api.datasetKey,
        personId,
        false,
      );
    }
    url.write({ wcaId: personId ?? "", focusMe: false });
  }, [api.datasetKey, url]);

  useEffect(() => {
    if (filters.subject !== "people" || rankings.loading) return;
    const requestKey = focusRequestKey(
      api.datasetKey,
      url.state.wcaId,
      url.state.focusMe,
    );
    if (
      (!url.state.wcaId && !url.state.focusMe) ||
      lastFocusRequestRef.current === requestKey
    ) return;
    if (url.state.wcaId) {
      lastFocusRequestRef.current = requestKey;
      focusWcaId(url.state.wcaId, false);
      return;
    }
    if (profileQuery.isPending) return;
    lastFocusRequestRef.current = requestKey;
    const profile = profileQuery.data?.profile;
    if (profile) focusWcaId(profile.wcaId, false);
  }, [
    api.datasetKey,
    filters.subject,
    focusWcaId,
    profileQuery.data,
    profileQuery.isPending,
    rankings.loading,
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
    highlightedPersonId: ui.highlightedPersonId,
    notice: ui.notice,
    error: ui.error || profileError,
    clear,
    clearHighlight,
    jumpToEntry,
    focusMyRanking,
    updateFocusedPerson,
  }), [
    clear,
    clearHighlight,
    focusMyRanking,
    jumpToEntry,
    profileError,
    ui,
    updateFocusedPerson,
  ]);
}

export type RankingFocus = ReturnType<typeof useRankingFocus>;
