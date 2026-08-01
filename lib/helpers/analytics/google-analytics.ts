import ReactGA from "react-ga4";

export const GOOGLE_ANALYTICS_MEASUREMENT_ID = "G-83F787NWS9";
export const ANALYTICS_NAVIGATION_EVENT = "wcarankings:navigation";

const ANALYTICS_QUERY_PARAMETERS = ["eventId", "result", "region"] as const;
const WCA_ID_PATTERN = /^\d{4}[A-Z0-9]{4}\d{2}$/i;

type AnalyticsEventParameters = Record<string, boolean | number | string | undefined>;

type GoogleAnalyticsClient = {
  initialize: (
    measurementId: string,
    options?: {
      gaOptions?: Record<string, unknown>;
      gtagOptions?: Record<string, unknown>;
    },
  ) => void;
  send: (fields: Record<string, unknown>) => void;
  event: (name: string, parameters?: AnalyticsEventParameters) => void;
};

type GoogleAnalyticsTrackerOptions = {
  client: GoogleAnalyticsClient;
  enabled: boolean;
  measurementId: string;
};

export function isGoogleAnalyticsEnabled(nodeEnvironment: string | undefined) {
  return nodeEnvironment === "production";
}

export function getSafeAnalyticsPath(input: URL | string) {
  const url = input instanceof URL ? input : new URL(input, "https://wcarankings.com");
  const pathname = url.pathname
    .split("/")
    .map((segment) => (WCA_ID_PATTERN.test(segment) ? ":personId" : segment))
    .join("/");
  const safeSearchParams = new URLSearchParams();

  for (const parameter of ANALYTICS_QUERY_PARAMETERS) {
    const value = url.searchParams.get(parameter);
    if (value) safeSearchParams.set(parameter, value);
  }

  const query = safeSearchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function createGoogleAnalyticsTracker({
  client,
  enabled,
  measurementId,
}: GoogleAnalyticsTrackerOptions) {
  let initialized = false;
  let lastPage = "";

  const initialize = () => {
    if (!enabled) return false;
    if (initialized) return true;

    try {
      client.initialize(measurementId, {
        gaOptions: {
          allowAdFeatures: false,
          allowAdPersonalizationSignals: false,
        },
        gtagOptions: {
          send_page_view: false,
          allow_google_signals: false,
          allow_ad_personalization_signals: false,
        },
      });
      initialized = true;
      return true;
    } catch {
      return false;
    }
  };

  const pageView = (input: URL | string) => {
    if (!initialize()) return false;
    const page = getSafeAnalyticsPath(input);
    if (page === lastPage) return false;

    try {
      client.send({ hitType: "pageview", page });
      lastPage = page;
      return true;
    } catch {
      return false;
    }
  };

  const event = (name: string, parameters?: AnalyticsEventParameters) => {
    if (!initialize()) return false;

    try {
      client.event(name, parameters);
      return true;
    } catch {
      return false;
    }
  };

  return { event, initialize, pageView };
}

const googleAnalytics = createGoogleAnalyticsTracker({
  client: ReactGA,
  enabled: isGoogleAnalyticsEnabled(process.env.NODE_ENV),
  measurementId: GOOGLE_ANALYTICS_MEASUREMENT_ID,
});

export function trackGoogleAnalyticsPageView(input: URL | string) {
  return googleAnalytics.pageView(input);
}

export function trackGoogleAnalyticsEvent(name: string, parameters?: AnalyticsEventParameters) {
  return googleAnalytics.event(name, parameters);
}

export function notifyAnalyticsNavigation() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ANALYTICS_NAVIGATION_EVENT));
}
