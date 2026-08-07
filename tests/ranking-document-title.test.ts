import assert from "node:assert/strict";
import test from "node:test";
import {
  formatRankingDocumentDescription,
  formatRankingDocumentTitle,
} from "@/lib/ranking-document-title";

const defaults = {
  subject: "people" as const,
  eventId: "333",
  rankingType: "single" as const,
  competitionRanking: "best-result" as const,
  cityRanking: "fastest-single" as const,
};

test("formats specific titles for people rankings and results", () => {
  assert.equal(
    formatRankingDocumentTitle(defaults),
    "3x3x3 Cube Single Rankings | WCA Rankings",
  );
  assert.equal(
    formatRankingDocumentTitle({ ...defaults, subject: "results" }),
    "3x3x3 Cube Single Results | WCA Rankings",
  );
  assert.equal(formatRankingDocumentDescription(defaults), "");
  assert.equal(
    formatRankingDocumentDescription({ ...defaults, subject: "results" }),
    "",
  );
  assert.equal(
    formatRankingDocumentDescription({
      ...defaults,
      subject: "competitions",
      competitionRanking: "competitor-count",
    }),
    "",
  );
  assert.equal(
    formatRankingDocumentDescription({
      ...defaults,
      subject: "cities",
      cityRanking: "fastest-single",
    }),
    "",
  );
});

test("formats titles for non-person ranking views and saved lists", () => {
  assert.equal(
    formatRankingDocumentTitle({
      ...defaults,
      subject: "competitions",
      competitionRanking: "podiums",
    }),
    "3x3x3 Cube Average Competition Podiums | WCA Rankings",
  );
  assert.equal(
    formatRankingDocumentTitle({
      ...defaults,
      subject: "competitions",
      eventId: "333bf",
      competitionRanking: "podiums",
      rankingType: "average",
    }),
    "3x3x3 Blindfolded Single Competition Podiums | WCA Rankings",
  );
  assert.equal(
    formatRankingDocumentTitle({ ...defaults, listName: "PNW Cubers" }),
    "PNW Cubers | WCA Rankings",
  );
  assert.equal(
    formatRankingDocumentTitle({
      ...defaults,
      eventId: "all",
      personMedalRanking: true,
      medalType: "gold",
    }),
    "Gold Medal Rankings | WCA Rankings",
  );
  assert.equal(
    formatRankingDocumentTitle({
      ...defaults,
      personPrStreakRanking: true,
      year: 2024,
    }),
    "PR Streak 2024 | WCA Rankings",
  );
});

test("includes the top three results in ranking descriptions", () => {
  assert.equal(
    formatRankingDocumentDescription(defaults, [
      "Teodor Zajder (2.76)",
      "Xuanyi Geng (2.80)",
      "Yiheng Wang (3.06)",
    ]),
    "Teodor Zajder (2.76)\nXuanyi Geng (2.80)\nYiheng Wang (3.06).",
  );
});

test("formats person activity ranking titles", () => {
  assert.equal(
    formatRankingDocumentTitle({
      ...defaults,
      personActivityRanking: true,
      personActivityMetric: "solves",
    }),
    "People by Official Solve Count | WCA Rankings",
  );
});
