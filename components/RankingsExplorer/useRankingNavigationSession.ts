"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { PendingPersonFocus } from "./helpers/pageLoadMotion";
import type { useRankingWindow } from "./useRankingWindow";

export function useRankingNavigationSession({
  pageKey,
  initialPageRequestKey,
  patchWindow,
}: {
  pageKey: string;
  initialPageRequestKey: string;
  patchWindow: ReturnType<typeof useRankingWindow>["actions"]["patch"];
}) {
  const activeListKeyRef = useRef(pageKey);
  const navigationEpochRef = useRef(0);
  const pendingFocusNoticeRef = useRef("");
  const pendingPersonFocusRef = useRef<PendingPersonFocus | null>(null);
  const pendingRankRef = useRef(1);
  const pendingFocusLastRef = useRef(false);
  const pendingScrollToTopRef = useRef(false);
  const pendingScrollDirectionRef = useRef<-1 | 1 | null>(null);
  const pendingNavigationAppendRef = useRef(false);
  const pendingNavigationRebaseRef = useRef<(() => void) | null>(null);
  const navigationTargetRankRef = useRef<number | null>(null);
  const pagerNavigationBusyRef = useRef(false);
  const preserveListDuringLoadRef = useRef(false);
  const initialPageKeyRef = useRef(initialPageRequestKey);
  const forcePageLoadRef = useRef(false);
  const skipPageLoadStartRef = useRef<number | null>(null);
  const pendingFirstPageFallbackRef = useRef(false);

  useEffect(() => {
    activeListKeyRef.current = pageKey;
  }, [pageKey]);

  const finishPagerNavigation = useCallback(() => {
    pagerNavigationBusyRef.current = false;
    patchWindow({ pagerNavigationBusy: false });
  }, [patchWindow]);
  const forceNextPageLoad = useCallback(() => {
    forcePageLoadRef.current = true;
  }, []);

  const refs = useMemo(() => ({
      activeListKeyRef,
      navigationEpochRef,
      pendingFocusNoticeRef,
      pendingPersonFocusRef,
      pendingRankRef,
      pendingFocusLastRef,
      pendingScrollToTopRef,
      pendingScrollDirectionRef,
      pendingNavigationAppendRef,
      pendingNavigationRebaseRef,
      navigationTargetRankRef,
      pagerNavigationBusyRef,
      preserveListDuringLoadRef,
      initialPageKeyRef,
      forcePageLoadRef,
      skipPageLoadStartRef,
      pendingFirstPageFallbackRef,
    }), []);

  const actions = useMemo(
    () => ({ finishPagerNavigation, forceNextPageLoad }),
    [finishPagerNavigation, forceNextPageLoad],
  );

  return useMemo(() => ({ refs, actions }), [actions, refs]);
}
