"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import {
  ANALYTICS_NAVIGATION_EVENT,
  trackGoogleAnalyticsPageView,
} from "@/lib/helpers/analytics/google-analytics";

export function GoogleAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    trackGoogleAnalyticsPageView(window.location.href);
    const trackCurrentPage = () => {
      trackGoogleAnalyticsPageView(window.location.href);
    };

    window.addEventListener("popstate", trackCurrentPage);
    window.addEventListener(ANALYTICS_NAVIGATION_EVENT, trackCurrentPage);
    return () => {
      window.removeEventListener("popstate", trackCurrentPage);
      window.removeEventListener(ANALYTICS_NAVIGATION_EVENT, trackCurrentPage);
    };
  }, [pathname]);

  return null;
}
