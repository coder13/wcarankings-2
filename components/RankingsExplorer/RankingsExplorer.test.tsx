import assert from "node:assert/strict";
import test from "node:test";
import { renderWithProviders } from "@/tests/render-providers";
import { EXPLORER_SUBJECTS } from "../ExplorerSubjectSwitch/ExplorerSubjectSwitch";
import { RankingsExplorer } from "./RankingsExplorer";
import { subjectPath } from "./helpers/navigation";
import { orderSearchMatches } from "./helpers/search";
import { getTopRailScrollProgress } from "./useRailScrollProgress";
import { competitionRankingPath } from "./useRankingsState";
import { rankingPageRequestUrl } from "./rankingsQueries";
import type { RankingsFilterState } from "./rankingsUrl";
import {
  personActivityRankingPath,
  parseRankingsUrl,
  serializeRankingsUrl,
  type RankingsUrlState,
} from "./rankingsUrl";
import type { RankingEntry } from "./types";

const rankingEntry: RankingEntry = {
  rank: 1,
  subRank: 1,
  personId: "2024AVERY01",
  personName: "Avery Chen",
  countryName: "United States",
  countryIso2: "US",
  best: 512,
  competitionId: "storybook-open",
  competitionName: "Storybook Open 2026",
  recordBadges: ["NR"],
};

test("clamps top rail progress during elastic overscroll", () => {
  assert.equal(getTopRailScrollProgress(-80, 100), 0);
  assert.equal(getTopRailScrollProgress(200, 100), 1);
});

function pathnameForFilters(filters: RankingsFilterState) {
  if (filters.subject === "results") return "/results";
  if (filters.subject === "competitions") {
    return `/competitions/${filters.competitionRanking}`;
  }
  if (filters.subject === "cities") return `/cities/${filters.cityRanking}`;
  if (filters.personCompetitionRanking) return "/persons/competitions";
  if (filters.personActivityRanking) {
    return personActivityRankingPath(filters.personActivityMetric);
  }
  if (filters.personMedalRanking) return "/persons/medals";
  if (filters.personPrStreakRanking) return "/persons/pr-streak";
  if (filters.year) return `/persons/year/${filters.year}`;
  return "/";
}

function renderExplorerMarkup(
  props: Partial<Parameters<typeof RankingsExplorer>[0]> = {},
  state: Partial<RankingsFilterState> = {},
) {
  const filters: RankingsFilterState = {
    subject: "people",
    competitionRanking: "best-result",
    cityRanking: "fastest-single",
    personCompetitionRanking: false,
    personActivityRanking: false,
    personActivityMetric: "competitions",
    personMedalRanking: false,
    personPrStreakRanking: false,
    medalType: "overall",
    year: null,
    eventId: "333",
    rankingType: "single",
    regionSelection: { scope: "world", regionId: "" },
    gender: [],
    latitudeHemisphere: "north",
    search: "",
    regexSearch: false,
    ...state,
  };
  const pathname = pathnameForFilters(filters);
  const urlState: RankingsUrlState = {
    ...filters,
    wcaId: "",
    focusMe: false,
    kinchOrder: "regional",
  };
  const searchParams = serializeRankingsUrl(pathname, urlState);

  return renderWithProviders(
    <RankingsExplorer
      initial={{
        data: {
          entries: [rankingEntry],
          hasMore: false,
          nextPageStart: null,
          previousPageStart: null,
          startRank: 1,
          startPosition: 0,
          lastRank: 1,
          total: 1,
        },
        regions: { continents: [], countries: [] },
      }}
      {...props}
    />,
    pathname,
    searchParams,
  );
}

test("ignores empty search-result slots", () => {
  const matches = new Array<typeof rankingEntry | undefined>(1);
  matches.push(rankingEntry);

  assert.deepEqual(orderSearchMatches(matches), [rankingEntry]);
});

test("gives each non-default subject and competition ranking a page", () => {
  assert.equal(subjectPath("people"), "/");
  assert.equal(subjectPath("results"), "/results");
  assert.equal(subjectPath("competitions"), "/competitions/best-result");
  assert.equal(subjectPath("cities"), "/cities/fastest-single");
  assert.equal(
    competitionRankingPath("best-result"),
    "/competitions/best-result",
  );
  assert.equal(competitionRankingPath("podiums"), "/competitions/podiums");
  assert.equal(
    competitionRankingPath("competitor-count"),
    "/competitions/competitor-count",
  );
  assert.equal(competitionRankingPath("latitude"), "/competitions/latitude");
});

test("exposes active person, result, and competition ranking subjects", () => {
  assert.deepEqual(
    EXPLORER_SUBJECTS.map(({ id }) => id),
    ["people", "results", "competitions", "cities"],
  );
});

test("renders the rankings shell with extracted components", () => {
  const markup = renderExplorerMarkup({
    source: {
      kind: "saved",
      listId: "7K3M9Q2D",
      listName: "Pacific Northwest cubers",
    },
  });
  assert.match(markup, /class="ViewportEdgeGradients"/);
  assert.match(markup, /data-top-visible="false"/);
  assert.match(markup, /data-bottom-visible="false"/);
  assert.match(markup, /WCA Lists/);
  assert.match(markup, /Avery Chen/);
  assert.doesNotMatch(markup, /sub-rank/);
  assert.doesNotMatch(markup, /Jump to top/);
});

test("renders a full-width spinner and fallback periods before rankings load", () => {
  const markup = renderExplorerMarkup({
    initial: undefined,
    options: { showSubjectSwitch: true },
  });

  assert.match(markup, /listMessage--initialLoading/);
  assert.match(markup, /role="status" aria-label="Loading rankings"/);
  assert.match(markup, /aria-label="Person ranking period"/);
  assert.match(markup, />All time</);
  assert.match(markup, new RegExp(`>${new Date().getFullYear()}<`));
  assert.match(markup, />2003</);
  assert.match(markup, />1982</);
});

test("keeps gender filters available for sum of ranks", () => {
  const markup = renderExplorerMarkup(
    {
      options: { showAllEventRankingOptions: true },
    },
    { eventId: "SOR" },
  );
  assert.match(markup, /aria-label="Gender"/);
  assert.match(markup, />Men</);
  assert.match(markup, />Women</);
  assert.doesNotMatch(markup, /Switch to average rankings/);
});

test("keeps gender filters available for Kinch", () => {
  const markup = renderExplorerMarkup(
    {
      options: { showAllEventRankingOptions: true },
    },
    { eventId: "sor-kinch" },
  );
  assert.match(markup, /aria-label="Gender"/);
  assert.match(markup, />Men</);
  assert.match(markup, />Women</);
  assert.doesNotMatch(markup, /Switch to average rankings/);
});

test("renders medal event and statistic controls", () => {
  const markup = renderExplorerMarkup(
    { options: { showSubjectSwitch: true } },
    { personMedalRanking: true, eventId: "all", medalType: "gold" },
  );
  assert.match(markup, />All events</);
  assert.match(markup, /aria-label="Medal statistic"/);
  assert.match(markup, />Gold medals</);
  assert.doesNotMatch(markup, />Sum of Ranks</);
  assert.doesNotMatch(markup, /Switch to average rankings/);
});

test("renders a separate person ranking picker", () => {
  const markup = renderExplorerMarkup({ options: { showSubjectSwitch: true } });

  assert.match(markup, /aria-label="Person ranking"/);
  assert.match(
    markup,
    /personRankingDropdown[\s\S]*?>Rankings<\/button><button[^>]*>Competition count<\/button><button[^>]*>Countries<\/button><button[^>]*>Rounds<\/button><button[^>]*>Solves<\/button><button[^>]*>Medals<\/button><button[^>]*>PR Streak<\/button>/,
  );
});

test("adds activity statistics to the person ranking selector", () => {
  const markup = renderExplorerMarkup({ options: { showSubjectSwitch: true } });

  assert.match(markup, />Countries</);
  assert.match(markup, />Rounds</);
  assert.match(markup, />Solves</);
});

test("keeps the activity metric in the person ranking selector", () => {
  const markup = renderExplorerMarkup(
    { options: { showSubjectSwitch: true } },
    { personActivityRanking: true, personActivityMetric: "rounds" },
  );
  assert.match(markup, /aria-label="Person ranking"/);
  assert.match(markup, />Competition count</);
  assert.match(markup, />Countries</);
  assert.match(markup, />Rounds</);
  assert.match(markup, />Solves</);
  assert.doesNotMatch(markup, /aria-label="Person ranking statistic"/);
  assert.doesNotMatch(markup, /Find ranking/);
});

test("uses a unique canonical path for each person activity stat", () => {
  const filters: RankingsUrlState = {
    subject: "people",
    competitionRanking: "best-result",
    cityRanking: "fastest-single",
    personCompetitionRanking: false,
    personActivityRanking: true,
    personActivityMetric: "countries",
    personMedalRanking: false,
    personPrStreakRanking: false,
    medalType: "overall",
    year: 2023,
    eventId: "333",
    rankingType: "single",
    regionSelection: { scope: "world", regionId: "" },
    gender: ["f", "o"],
    latitudeHemisphere: "north",
    search: "",
    regexSearch: false,
    wcaId: "",
    focusMe: false,
    kinchOrder: "regional",
  };
  assert.equal(
    serializeRankingsUrl("/persons/countries", filters).toString(),
    "gender=f%2Co&year=2023",
  );
  const parsed = parseRankingsUrl(
    "/persons/countries",
    new URLSearchParams("year=2023&search=Avery"),
  );
  assert.equal(parsed.personActivityRanking, true);
  assert.equal(parsed.personActivityMetric, "countries");
  assert.equal(parsed.year, 2023);
  assert.equal(parsed.search, "Avery");
});

test("renders PR Streak without event or result controls", () => {
  const markup = renderExplorerMarkup(
    { options: { showSubjectSwitch: true } },
    { personPrStreakRanking: true, year: 2023 },
  );
  assert.match(markup, />PR Streak</);
  assert.match(markup, /aria-label="Person ranking period"/);
  assert.match(markup, />All time</);
  assert.match(markup, />2023</);
  assert.doesNotMatch(markup, /aria-label="Event"/);
  assert.doesNotMatch(markup, /Switch to average rankings/);
});

test("requests PR Streak with one-based positions and no event dimensions", () => {
  const url = new URL(
    rankingPageRequestUrl(
      {
        eventId: "333",
        rankingType: "single",
        regionSelection: { scope: "world", regionId: "" },
        resource: "person-pr-streak",
        gender: [],
        year: null,
        medalType: "overall",
        personActivityMetric: "competitions",
      },
      1,
    ),
    "http://localhost",
  );
  assert.equal(url.pathname, "/api/rankings/people/pr-streak");
  assert.equal(url.searchParams.get("start"), "1");
  assert.equal(url.searchParams.has("eventId"), false);
  assert.equal(url.searchParams.has("result"), false);
});
