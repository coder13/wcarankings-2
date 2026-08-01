import assert from "node:assert/strict";
import test from "node:test";
import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VimSearchInput } from "./VimSearchInput";

test("renders regex search status without internal ordering details", () => {
  const markup = renderToStaticMarkup(
    <VimSearchInput
      state={{
        inputRef: createRef<HTMLInputElement>(),
        mode: false,
        command: "",
        helpOpen: false,
      }}
      search={{
        active: true,
        query: "Avery",
        loading: false,
        pending: false,
        activeMatch: {
          rank: 3,
          subRank: 3,
          personId: "2024AVERY01",
          personName: "Avery Chen",
          countryName: "United States",
          countryIso2: "US",
          best: 700,
          competitionId: "open",
          competitionName: "Open",
          recordBadges: [],
        },
        matches: [],
      }}
      actions={{
        changeCommand: () => undefined,
        closeSearch: () => undefined,
        cycleSearch: () => undefined,
        toggleHelp: () => undefined,
      }}
    />,
  );
  assert.match(markup, /Avery Chen/);
  assert.doesNotMatch(markup, /sub-rank/);
});
