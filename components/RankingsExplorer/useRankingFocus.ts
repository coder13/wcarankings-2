"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
} from "react";
import { useWcaProfile } from "../Auth/useWcaProfile";
import type { ExplorerSubject } from "../ExplorerSubjectSwitch/ExplorerSubjectSwitch";
import type { RankingDataSource } from "./useRankingDataSource";
import type { useRankingsUrlState } from "./useRankingsUrlState";
import type { useRankingWindow } from "./useRankingWindow";
import type { RegionSelection } from "./types";

type FocusFilters = {
  subject: ExplorerSubject;
  eventId: string;
  rankingType: "single" | "average";
  regionSelection: RegionSelection;
};

type FocusControllers = {
  locateRanking: RankingDataSource["requests"]["locateRanking"];
  patch: ReturnType<typeof useRankingWindow>["actions"]["patch"];
  resetToRank: (
    rank: number,
    animate?: boolean,
    focusedPersonId?: string | null,
  ) => void;
};

type FocusUrl = {
  state: Pick<
    ReturnType<typeof useRankingsUrlState>["state"],
    "focusMe" | "wcaId"
  >;
  write: ReturnType<typeof useRankingsUrlState>["write"];
};

export function useRankingFocus({
  filters,
  controllers,
  url,
  pendingFocusNoticeRef,
}: {
  filters: FocusFilters;
  controllers: FocusControllers;
  url: FocusUrl;
  pendingFocusNoticeRef: MutableRefObject<string>;
}) {
  const {
    subject,
    eventId,
    rankingType,
    regionSelection,
  } = filters;
  const { locateRanking, patch, resetToRank } = controllers;
  const { state: urlState, write: writeUrl } = url;
  const focusResolutionEpochRef = useRef(0);
  const focusedWcaIdRef = useRef("");
  const lastFocusRequestRef = useRef("");
  const profileQuery = useWcaProfile(
    subject === "people" && urlState.focusMe,
  );

  const focusWcaId = useCallback((wcaId: string, animate = true) => {
    if (subject !== "people") return;
    const resolutionEpoch = focusResolutionEpochRef.current + 1;
    focusResolutionEpochRef.current = resolutionEpoch;
    patch({ error: "" });
    void locateRanking(wcaId)
      .then(({ located }) => {
        if (resolutionEpoch !== focusResolutionEpochRef.current) return;
        if (!located) {
          const notice =
            "That person is not ranked for the selected event or filters.";
          patch({ focusedExpandedPersonId: "" });
          pendingFocusNoticeRef.current = notice;
          patch({ focusNotice: notice });
          resetToRank(1, false);
          return;
        }
        pendingFocusNoticeRef.current = "";
        patch({
          focusNotice: "",
          focusedExpandedPersonId: located.personId,
        });
        resetToRank(located.subRank, animate, located.personId);
      })
      .catch((error: unknown) => {
        if (resolutionEpoch !== focusResolutionEpochRef.current) return;
        patch({
          error: error instanceof Error
            ? error.message
            : "Could not find this person in the rankings.",
        });
      });
  }, [
    locateRanking,
    patch,
    pendingFocusNoticeRef,
    resetToRank,
    subject,
  ]);

  const focusMyRanking = useCallback((wcaId: string) => {
    focusedWcaIdRef.current = wcaId;
    patch({ focusedExpandedPersonId: wcaId });
    writeUrl({ focusMe: true, wcaId: "" });
    lastFocusRequestRef.current = [
      eventId,
      rankingType,
      regionSelection.scope,
      regionSelection.regionId,
      "",
      "me",
    ].join(":");
    focusWcaId(wcaId);
  }, [eventId, focusWcaId, patch, rankingType, regionSelection, writeUrl]);

  const updateFocusedPerson = useCallback((personId: string | null) => {
    if (personId) {
      lastFocusRequestRef.current = [
        eventId,
        rankingType,
        regionSelection.scope,
        regionSelection.regionId,
        personId,
        "",
      ].join(":");
      focusedWcaIdRef.current = personId;
      patch({
        highlightedPersonId: personId,
        focusedExpandedPersonId: personId,
      });
      writeUrl({ wcaId: personId, focusMe: false });
      return;
    }
    focusedWcaIdRef.current = "";
    pendingFocusNoticeRef.current = "";
    patch({
      highlightedPersonId: "",
      focusedExpandedPersonId: "",
      focusNotice: "",
    });
    writeUrl({ wcaId: "", focusMe: false });
  }, [eventId, patch, pendingFocusNoticeRef, rankingType, regionSelection, writeUrl]);

  useEffect(() => {
    if (subject !== "people") return;
    const explicitWcaId = urlState.wcaId;
    const focusMe = urlState.focusMe;
    const requestKey = [
      eventId,
      rankingType,
      regionSelection.scope,
      regionSelection.regionId,
      explicitWcaId ?? "",
      focusMe ? "me" : "",
    ].join(":");
    if (
      (!explicitWcaId && !focusMe) ||
      lastFocusRequestRef.current === requestKey
    ) return;

    if (explicitWcaId) {
      lastFocusRequestRef.current = requestKey;
      focusedWcaIdRef.current = explicitWcaId;
      patch({ focusedExpandedPersonId: explicitWcaId });
      queueMicrotask(() => {
        if (lastFocusRequestRef.current === requestKey) {
          focusWcaId(explicitWcaId, false);
        }
      });
      return;
    }
    if (focusedWcaIdRef.current) {
      lastFocusRequestRef.current = requestKey;
      const wcaId = focusedWcaIdRef.current;
      patch({ focusedExpandedPersonId: wcaId });
      queueMicrotask(() => {
        if (lastFocusRequestRef.current === requestKey) {
          focusWcaId(wcaId, false);
        }
      });
      return;
    }

    if (profileQuery.isPending) return;
    lastFocusRequestRef.current = requestKey;
    const profile = profileQuery.data?.profile;
    if (!profile) {
      patch({
        error: profileQuery.error instanceof Error
          ? profileQuery.error.message
          : "Sign in with WCA to jump to your ranking.",
      });
      return;
    }
    focusedWcaIdRef.current = profile.wcaId;
    patch({ focusedExpandedPersonId: profile.wcaId });
    focusWcaId(profile.wcaId, false);
  }, [
    eventId,
    focusWcaId,
    patch,
    profileQuery.data,
    profileQuery.error,
    profileQuery.isPending,
    rankingType,
    regionSelection,
    subject,
    urlState.focusMe,
    urlState.wcaId,
  ]);

  return useMemo(
    () => ({ focusMyRanking, updateFocusedPerson }),
    [focusMyRanking, updateFocusedPerson],
  );
}
