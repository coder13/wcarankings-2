import assert from "node:assert/strict";
import test from "node:test";
import { profileResultsHref } from "../components/ProfileResults/profileResultsUrl";

test("builds a person result page URL with its selected event and type", () => {
  assert.equal(
    profileResultsHref({
      personId: "2014niel03",
      eventId: "333",
      resultType: "average",
    }),
    "/person/2014NIEL03/results?eventId=333&result=average",
  );
});

test("keeps a selected year in the person result page URL", () => {
  assert.equal(
    profileResultsHref({
      personId: "2014NIEL03",
      eventId: "333",
      resultType: "single",
      year: 2023,
    }),
    "/person/2014NIEL03/results?eventId=333&result=single&year=2023",
  );
});
