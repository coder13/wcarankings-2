import assert from "node:assert/strict";
import test from "node:test";
import { formatRankingDocumentTitle } from "@/lib/ranking-document-title";

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
});
