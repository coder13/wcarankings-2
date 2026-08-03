"use client";

import { useLayoutEffect, useState } from "react";

const LIST_SELECTOR = "[data-rankings-list]";
const CONTAINER_SELECTOR = "[data-rankings-list-container]";

export function useRankingListOffset() {
  const [listOffset, setListOffset] = useState(0);

  useLayoutEffect(() => {
    let observedContainer: Element | null = null;
    const resizeObserver = new ResizeObserver(() => measure());
    const measure = () => {
      const list = document.querySelector(LIST_SELECTOR);
      const container = document.querySelector(CONTAINER_SELECTOR);
      if (container !== observedContainer) {
        if (observedContainer) resizeObserver.unobserve(observedContainer);
        if (container) resizeObserver.observe(container);
        observedContainer = container;
      }
      if (!list) return;
      const nextOffset = list.getBoundingClientRect().top + window.scrollY;
      setListOffset((current) => current === nextOffset ? current : nextOffset);
    };
    const mutationObserver = new MutationObserver(measure);
    resizeObserver.observe(document.body);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    window.visualViewport?.addEventListener("resize", measure);
    measure();
    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, []);

  return listOffset;
}
