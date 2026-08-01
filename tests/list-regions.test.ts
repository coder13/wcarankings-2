import assert from "node:assert/strict";
import test from "node:test";
import {
  hasMultipleListCountries,
  normalizeListRegionSelection,
} from "@/services/lists/regions";

const northAmerica = {
  continents: [{ id: "_North America", name: "_North America" }],
  countries: [
    { id: "USA", name: "United States", iso2: "US" },
    { id: "CAN", name: "Canada", iso2: "CA" },
  ],
};

test("keeps list region selections within member regions", () => {
  assert.deepEqual(
    normalizeListRegionSelection(
      { scope: "country", regionId: "USA" },
      northAmerica,
    ),
    { scope: "country", regionId: "USA" },
  );
  assert.deepEqual(
    normalizeListRegionSelection(
      { scope: "continent", regionId: "_Europe" },
      northAmerica,
    ),
    { scope: "world", regionId: "" },
  );
});

test("disables list region changes when every member has one country", () => {
  assert.equal(hasMultipleListCountries(northAmerica), true);
  assert.equal(
    hasMultipleListCountries({
      continents: northAmerica.continents,
      countries: [northAmerica.countries[0]],
    }),
    false,
  );
  assert.deepEqual(
    normalizeListRegionSelection(
      { scope: "country", regionId: "USA" },
      { continents: northAmerica.continents, countries: [northAmerica.countries[0]] },
    ),
    { scope: "world", regionId: "" },
  );
});
