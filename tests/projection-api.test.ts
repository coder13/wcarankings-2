import assert from "node:assert/strict";
import test from "node:test";
import {
  ApiInputError,
  optionalInteger,
  parseEvent,
  parseGender,
  parseLimit,
  parsePersonId,
  parseResultType,
  parseScope,
  parseStart,
  parseYear,
} from "../lib/projection-api";
import { genderFiltersLabel, normalizeGenderFilters } from "../lib/wca";

test("parses bounded semantic ranking parameters", () => {
  const params = new URLSearchParams({
    eventId: "333",
    result: "average",
    region: "_Europe",
    personId: "2010TEST01",
    start: "101",
    limit: "50",
  });
  assert.equal(parseEvent(params), "333");
  assert.equal(parseResultType(params, "333"), "average");
  assert.deepEqual(parseScope(params), { scope: "continent", regionId: "_Europe" });
  assert.equal(parsePersonId(params), "2010TEST01");
  assert.equal(parseStart(params), 101);
  assert.equal(parseLimit(params), 50);
  assert.equal(parseYear(new URLSearchParams({ year: "2025" })), 2025);
  assert.deepEqual(parseGender(new URLSearchParams({ gender: "m,f" })), ["m", "f"]);
  assert.deepEqual(parseGender(new URLSearchParams({ gender: "o" })), ["o"]);
  assert.deepEqual(parseGender(new URLSearchParams()), []);
  assert.equal(genderFiltersLabel([]), "All");
  assert.equal(genderFiltersLabel(["m", "f"]), "M, F");
  assert.equal(genderFiltersLabel(["f", "o"]), "F, O");
  assert.equal(genderFiltersLabel(["m", "o"]), "M, O");
  assert.deepEqual(normalizeGenderFilters(["m", "f", "o"]), []);
  assert.equal(genderFiltersLabel(["m", "f", "o"]), "All");
});

test("rejects malformed yearly ranking parameters", () => {
  assert.throws(() => parseYear(new URLSearchParams({ year: "25" })), ApiInputError);
});

test("rejects unsupported gender filters", () => {
  assert.throws(() => parseGender(new URLSearchParams({ gender: "x" })), ApiInputError);
});

test("rejects invalid limits and unsupported Multi-Blind averages", () => {
  assert.throws(
    () => parseLimit(new URLSearchParams({ limit: "101" })),
    ApiInputError,
  );
  assert.throws(
    () => parseResultType(new URLSearchParams({ result: "average" }), "333mbf"),
    ApiInputError,
  );
});

test("keeps cursor integers explicit", () => {
  assert.equal(optionalInteger(new URLSearchParams({ afterValue: "1234" }), "afterValue"), 1234);
  assert.equal(optionalInteger(new URLSearchParams(), "afterValue"), null);
  assert.throws(
    () => optionalInteger(new URLSearchParams({ afterValue: "12.5" }), "afterValue"),
    ApiInputError,
  );
});
