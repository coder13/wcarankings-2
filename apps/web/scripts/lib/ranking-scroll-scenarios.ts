import type {
  RankingScenario,
  ScenarioParamValue,
} from "./ranking-scroll-types.ts";

function scenario(
  id: string,
  label: string,
  path: string,
  params: Record<string, ScenarioParamValue>,
): RankingScenario {
  return { id, label, path, params };
}

export const PR_STREAK_RANKING_SCENARIOS = [
  scenario(
    "world",
    "precomputed PR Streak world",
    "/api/persons/pr-streak",
    {},
  ),
  scenario(
    "canada-f",
    "precomputed PR Streak Canada women",
    "/api/persons/pr-streak",
    { region: "Canada", gender: ["f"] },
  ),
  scenario(
    "world-fo",
    "lazy PR Streak world female-other cohort",
    "/api/persons/pr-streak",
    { gender: ["f", "o"] },
  ),
  scenario(
    "canada-2023-fo",
    "lazy PR Streak Canada female-other 2023 cohort",
    "/api/persons/pr-streak",
    { region: "Canada", year: "2023", gender: ["f", "o"] },
  ),
].map((entry) => ({ ...entry, startBase: 1 }));

export const PERSON_RANKING_SCENARIOS = [
  scenario(
    "event-single-world",
    "precomputed person world single",
    "/api/persons/rankings",
    {
      eventId: "333",
      result: "single",
      paged: "1",
    },
  ),
  scenario(
    "event-average-world",
    "precomputed person world average",
    "/api/persons/rankings",
    {
      eventId: "333",
      result: "average",
      paged: "1",
    },
  ),
  scenario(
    "event-single-world-2023",
    "precomputed person world single year",
    "/api/persons/rankings",
    {
      eventId: "333",
      result: "single",
      year: "2023",
      paged: "1",
    },
  ),
  ...["Canada", "China", "USA"].map((region) =>
    scenario(
      `event-single-${region.toLowerCase()}`,
      `precomputed person ${region} single`,
      "/api/persons/rankings",
      { eventId: "333", result: "single", region, paged: "1" },
    ),
  ),
  scenario(
    "event-single-world-f",
    "filtered person world women",
    "/api/persons/rankings",
    {
      eventId: "333",
      result: "single",
      gender: ["f"],
      paged: "1",
    },
  ),
  scenario(
    "event-single-world-fo",
    "filtered person world female-other",
    "/api/persons/rankings",
    {
      eventId: "333",
      result: "single",
      gender: ["f", "o"],
      paged: "1",
    },
  ),
  scenario(
    "event-single-canada-2023-fo",
    "filtered person Canada female-other 2023",
    "/api/persons/rankings",
    {
      eventId: "333",
      result: "single",
      region: "Canada",
      year: "2023",
      gender: ["f", "o"],
      paged: "1",
    },
  ),
  scenario(
    "event-single-north-america-2023-mf",
    "filtered person North America male-female 2023",
    "/api/persons/rankings",
    {
      eventId: "333",
      result: "single",
      region: "_North America",
      year: "2023",
      gender: ["m", "f"],
      paged: "1",
    },
  ),
  scenario(
    "sum-of-ranks-single-world",
    "primed Sum of Ranks world single",
    "/api/persons/rankings",
    {
      eventId: "SOR",
      result: "single",
      paged: "1",
    },
  ),
  scenario(
    "sum-of-ranks-average-world",
    "primed Sum of Ranks world average",
    "/api/persons/rankings",
    {
      eventId: "SOR",
      result: "average",
      paged: "1",
    },
  ),
  scenario(
    "sum-of-ranks-single-canada",
    "primed Sum of Ranks Canada single",
    "/api/persons/rankings",
    {
      eventId: "SOR",
      result: "single",
      region: "Canada",
      paged: "1",
    },
  ),
  scenario(
    "sum-of-ranks-single-world-f",
    "lazy Sum of Ranks world women",
    "/api/persons/rankings",
    {
      eventId: "SOR",
      result: "single",
      gender: ["f"],
      paged: "1",
    },
  ),
  scenario("kinch-world", "primed Kinch world", "/api/persons/rankings", {
    eventId: "sor-kinch",
    result: "single",
    paged: "1",
  }),
  scenario(
    "kinch-canada-regional",
    "primed Kinch Canada regional order",
    "/api/persons/rankings",
    {
      eventId: "sor-kinch",
      result: "single",
      region: "Canada",
      paged: "1",
    },
  ),
  scenario(
    "kinch-canada-continent",
    "primed Kinch Canada continent order",
    "/api/persons/rankings",
    {
      eventId: "sor-kinch",
      result: "single",
      region: "Canada",
      kinch: "continent",
      paged: "1",
    },
  ),
  scenario(
    "competition-count-world",
    "person competition count world",
    "/api/persons/competitions",
    { eventId: "333", result: "single", paged: "1" },
  ),
  scenario(
    "competition-count-canada-f",
    "person competition count Canada women",
    "/api/persons/competitions",
    {
      eventId: "333",
      result: "single",
      region: "Canada",
      gender: ["f"],
      paged: "1",
    },
  ),
];

export const RESULT_RANKING_SCENARIOS = [
  scenario(
    "single-world",
    "precomputed result world single",
    "/api/persons/results",
    {
      eventId: "333",
      result: "single",
    },
  ),
  scenario(
    "average-world",
    "precomputed result world average",
    "/api/persons/results",
    {
      eventId: "333",
      result: "average",
    },
  ),
  scenario(
    "single-world-2023",
    "lazy result world single year",
    "/api/persons/results",
    {
      eventId: "333",
      result: "single",
      year: "2023",
    },
  ),
  ...["Canada", "China", "USA"].map((region) =>
    scenario(
      `single-${region.toLowerCase()}`,
      `result ${region} single`,
      "/api/persons/results",
      { eventId: "333", result: "single", region },
    ),
  ),
  scenario(
    "single-world-f",
    "lazy result world women",
    "/api/persons/results",
    {
      eventId: "333",
      result: "single",
      gender: ["f"],
    },
  ),
  scenario(
    "average-world-f",
    "lazy result world women average",
    "/api/persons/results",
    {
      eventId: "333",
      result: "average",
      gender: ["f"],
    },
  ),
  scenario(
    "single-world-fo",
    "lazy result world female-other",
    "/api/persons/results",
    {
      eventId: "333",
      result: "single",
      gender: ["f", "o"],
    },
  ),
  ...["Canada", "China", "USA"].map((region) =>
    scenario(
      `average-${region.toLowerCase()}-2023-fo`,
      `lazy result ${region} female-other average 2023`,
      "/api/persons/results",
      {
        eventId: "333",
        result: "average",
        region,
        year: "2023",
        gender: ["f", "o"],
      },
    ),
  ),
];

export const COMPETITION_RANKING_SCENARIOS = [
  scenario(
    "fastest-single",
    "fastest competition single",
    "/api/competitions/best-result",
    {
      eventId: "333",
      result: "single",
    },
  ),
  scenario(
    "fastest-average",
    "fastest competition average",
    "/api/competitions/best-result",
    {
      eventId: "333",
      result: "average",
    },
  ),
  scenario("podium", "competition podium", "/api/competitions/podiums", {
    eventId: "333",
    result: "average",
  }),
  scenario(
    "competitor-count",
    "competition competitor count",
    "/api/competitions/competitor-count",
    {},
  ),
  scenario(
    "latitude-north",
    "northernmost competitions",
    "/api/competitions/latitude",
    {
      hemisphere: "north",
    },
  ),
  scenario(
    "latitude-south",
    "southernmost competitions",
    "/api/competitions/latitude",
    {
      hemisphere: "south",
    },
  ),
  scenario(
    "latitude-north-canada",
    "northernmost Canada competitions",
    "/api/competitions/latitude",
    {
      hemisphere: "north",
      region: "Canada",
    },
  ),
];

export const CITY_RANKING_SCENARIOS = [
  scenario(
    "fastest-single-world",
    "fastest city single world",
    "/api/cities/fastest-single",
    { eventId: "333" },
  ),
  scenario(
    "fastest-average-world",
    "fastest city average world",
    "/api/cities/fastest-average",
    { eventId: "333" },
  ),
  scenario(
    "fastest-single-canada",
    "fastest city single Canada",
    "/api/cities/fastest-single",
    {
      eventId: "333",
      region: "Canada",
    },
  ),
  scenario(
    "fastest-single-world-f",
    "fastest city single women",
    "/api/cities/fastest-single",
    {
      eventId: "333",
      gender: ["f"],
    },
  ),
  scenario(
    "fastest-single-canada-f",
    "fastest city single Canada women",
    "/api/cities/fastest-single",
    {
      eventId: "333",
      region: "Canada",
      gender: ["f"],
    },
  ),
  ...["competitors", "competitions", "solves"].map((stat) =>
    scenario(`${stat}-world`, `city ${stat} world`, `/api/cities/${stat}`, {
      eventId: "333",
    }),
  ),
  scenario(
    "competitors-canada",
    "city competitors Canada",
    "/api/cities/competitors",
    {
      eventId: "333",
      region: "Canada",
    },
  ),
  scenario("solves-world-f", "city solves women", "/api/cities/solves", {
    eventId: "333",
    gender: ["f"],
  }),
];

export const MEDAL_RANKING_SCENARIOS = [
  scenario(
    "overall-all-events-world",
    "all-event overall medals",
    "/api/persons/medals",
    { medal: "overall", paged: "1" },
  ),
  scenario("gold-333-world", "3x3x3 gold medals", "/api/persons/medals", {
    eventId: "333",
    medal: "gold",
    paged: "1",
  }),
  scenario("bronze-usa", "United States bronze medals", "/api/persons/medals", {
    medal: "bronze",
    region: "USA",
    paged: "1",
  }),
  scenario(
    "silver-all-events-women",
    "women's silver medals",
    "/api/persons/medals",
    { medal: "silver", gender: ["f"], paged: "1" },
  ),
  scenario(
    "gold-333-2024-women-france",
    "2024 French women's 3x3x3 gold medals",
    "/api/persons/medals",
    {
      eventId: "333",
      medal: "gold",
      year: "2024",
      gender: ["f"],
      region: "France",
      paged: "1",
    },
  ),
].map((entry) => ({ ...entry, startBase: 1 }));

export const RANKING_SCROLL_SUITES = {
  persons: PERSON_RANKING_SCENARIOS,
  results: RESULT_RANKING_SCENARIOS,
  competitions: COMPETITION_RANKING_SCENARIOS,
  cities: CITY_RANKING_SCENARIOS,
  medals: MEDAL_RANKING_SCENARIOS,
  prStreak: PR_STREAK_RANKING_SCENARIOS,
};

export const ALL_RANKING_SCROLL_SCENARIOS = Object.entries(
  RANKING_SCROLL_SUITES,
).flatMap(([suite, scenarios]) =>
  scenarios.map((entry) => ({ ...entry, suite })),
);
