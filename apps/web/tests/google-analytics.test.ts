import assert from "node:assert/strict";
import test from "node:test";
import {
  createGoogleAnalyticsTracker,
  getSafeAnalyticsPath,
  isGoogleAnalyticsEnabled,
} from "../lib/helpers/analytics/google-analytics";

function createClient() {
  const calls: Array<{ name: string; value: unknown }> = [];
  return {
    calls,
    client: {
      initialize: (...value: unknown[]) =>
        calls.push({ name: "initialize", value }),
      send: (value: unknown) => calls.push({ name: "send", value }),
      event: (...value: unknown[]) => calls.push({ name: "event", value }),
    },
  };
}

test("enables Google Analytics only in production", () => {
  assert.equal(isGoogleAnalyticsEnabled("production"), true);
  assert.equal(isGoogleAnalyticsEnabled("development"), false);
  assert.equal(isGoogleAnalyticsEnabled("test"), false);
  assert.equal(isGoogleAnalyticsEnabled(undefined), false);
});

test("removes searches, unknown parameters, and WCA IDs from analytics paths", () => {
  assert.equal(
    getSafeAnalyticsPath(
      "https://wcarankings.com/person/2016HOOV01?search=Cailyn&eventId=333oh&result=average&mode=vim",
    ),
    "/person/:personId?eventId=333oh&result=average",
  );
});

test("does nothing when analytics is disabled", () => {
  const { calls, client } = createClient();
  const tracker = createGoogleAnalyticsTracker({
    client,
    enabled: false,
    measurementId: "G-TEST",
  });

  assert.equal(tracker.pageView("https://wcarankings.com/"), false);
  assert.equal(tracker.event("ranking_search_used"), false);
  assert.deepEqual(calls, []);
});

test("initializes once and sends one page view for each safe path", () => {
  const { calls, client } = createClient();
  const tracker = createGoogleAnalyticsTracker({
    client,
    enabled: true,
    measurementId: "G-TEST",
  });

  assert.equal(
    tracker.pageView("https://wcarankings.com/?eventId=333oh&search=first"),
    true,
  );
  assert.equal(
    tracker.pageView("https://wcarankings.com/?eventId=333oh&search=second"),
    false,
  );
  assert.equal(tracker.pageView("https://wcarankings.com/?eventId=444"), true);

  assert.equal(calls.filter((call) => call.name === "initialize").length, 1);
  assert.deepEqual(
    calls.filter((call) => call.name === "send").map((call) => call.value),
    [
      { hitType: "pageview", page: "/?eventId=333oh" },
      { hitType: "pageview", page: "/?eventId=444" },
    ],
  );
});
