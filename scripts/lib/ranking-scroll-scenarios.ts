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
    "/api/rankings/people/pr-streak",
    {},
  ),
  scenario(
    "canada-f",
    "precomputed PR Streak Canada women",
    "/api/rankings/people/pr-streak",
    { region: "Canada", gender: ["f"] },
  ),
  scenario(
    "world-fo",
    "lazy PR Streak world female-other cohort",
    "/api/rankings/people/pr-streak",
    { gender: ["f", "o"] },
  ),
  scenario(
    "canada-2023-fo",
    "lazy PR Streak Canada female-other 2023 cohort",
    "/api/rankings/people/pr-streak",
    { region: "Canada", year: "2023", gender: ["f", "o"] },
  ),
].map((entry) => ({ ...entry, startBase: 1 }));

export const PERSON_RANKING_SCENARIOS = [
  scenario(
    "event-single-world",
    "precomputed person world single",
    "/api/rankings",
    {
      eventId: "333",
      result: "single",
      paged: "1",
    },
  ),
  scenario(
    "event-average-world",
    "precomputed person world average",
    "/api/rankings",
    {
      eventId: "333",
      result: "average",
      paged: "1",
    },
  ),
  scenario(
    "event-single-world-2023",
    "precomputed person world single year",
    "/api/rankings",
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
      "/api/rankings",
      { eventId: "333", result: "single", region, paged: "1" },
    ),
  ),
  scenario(
    "event-single-world-f",
    "filtered person world women",
    "/api/rankings",
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
    "/api/rankings",
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
    "/api/rankings",
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
    "/api/rankings",
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
    "/api/rankings",
    {
      eventId: "SOR",
      result: "single",
      paged: "1",
    },
  ),
  scenario(
    "sum-of-ranks-average-world",
    "primed Sum of Ranks world average",
    "/api/rankings",
    {
      eventId: "SOR",
      result: "average",
      paged: "1",
    },
  ),
  scenario(
    "sum-of-ranks-single-canada",
    "primed Sum of Ranks Canada single",
    "/api/rankings",
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
    "/api/rankings",
    {
      eventId: "SOR",
      result: "single",
      gender: ["f"],
      paged: "1",
    },
  ),
  scenario("kinch-world", "primed Kinch world", "/api/rankings", {
    eventId: "sor-kinch",
    result: "single",
    paged: "1",
  }),
  scenario(
    "kinch-canada-regional",
    "primed Kinch Canada regional order",
    "/api/rankings",
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
    "/api/rankings",
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
    "/api/rankings/people/competitions",
    { eventId: "333", result: "single", paged: "1" },
  ),
  scenario(
    "competition-count-canada-f",
    "person competition count Canada women",
    "/api/rankings/people/competitions",
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
    "/api/rankings/results",
    {
      eventId: "333",
      result: "single",
    },
  ),
  scenario(
    "average-world",
    "precomputed result world average",
    "/api/rankings/results",
    {
      eventId: "333",
      result: "average",
    },
  ),
  scenario(
    "single-world-2023",
    "lazy result world single year",
    "/api/rankings/results",
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
      "/api/rankings/results",
      { eventId: "333", result: "single", region },
    ),
  ),
  scenario(
    "single-world-f",
    "lazy result world women",
    "/api/rankings/results",
    {
      eventId: "333",
      result: "single",
      gender: ["f"],
    },
  ),
  scenario(
    "average-world-f",
    "lazy result world women average",
    "/api/rankings/results",
    {
      eventId: "333",
      result: "average",
      gender: ["f"],
    },
  ),
  scenario(
    "single-world-fo",
    "lazy result world female-other",
    "/api/rankings/results",
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
      "/api/rankings/results",
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
    "/api/rankings/competitions",
    {
      eventId: "333",
      result: "single",
      ranking: "fastest",
    },
  ),
  scenario(
    "fastest-average",
    "fastest competition average",
    "/api/rankings/competitions",
    {
      eventId: "333",
      result: "average",
      ranking: "fastest",
    },
  ),
  scenario("podium", "competition podium", "/api/rankings/competitions", {
    eventId: "333",
    result: "average",
    ranking: "podium",
  }),
  scenario(
    "competitor-count",
    "competition competitor count",
    "/api/rankings/competitions",
    {
      eventId: "333",
      result: "single",
      ranking: "competitor-count",
    },
  ),
  scenario(
    "latitude-north",
    "northernmost competitions",
    "/api/rankings/competitions",
    {
      eventId: "333",
      result: "single",
      ranking: "latitude",
      hemisphere: "north",
    },
  ),
  scenario(
    "latitude-south",
    "southernmost competitions",
    "/api/rankings/competitions",
    {
      eventId: "333",
      result: "single",
      ranking: "latitude",
      hemisphere: "south",
    },
  ),
  scenario(
    "latitude-north-canada",
    "northernmost Canada competitions",
    "/api/rankings/competitions",
    {
      eventId: "333",
      result: "single",
      ranking: "latitude",
      hemisphere: "north",
      region: "Canada",
    },
  ),
];

export const CITY_RANKING_SCENARIOS = [
  scenario(
    "fastest-single-world",
    "fastest city single world",
    "/api/rankings/cities",
    {
      eventId: "333",
      result: "single",
    },
  ),
  scenario(
    "fastest-average-world",
    "fastest city average world",
    "/api/rankings/cities",
    {
      eventId: "333",
      result: "average",
    },
  ),
  scenario(
    "fastest-single-canada",
    "fastest city single Canada",
    "/api/rankings/cities",
    {
      eventId: "333",
      result: "single",
      region: "Canada",
    },
  ),
  scenario(
    "fastest-single-world-f",
    "fastest city single women",
    "/api/rankings/cities",
    {
      eventId: "333",
      result: "single",
      gender: ["f"],
    },
  ),
  scenario(
    "fastest-single-canada-f",
    "fastest city single Canada women",
    "/api/rankings/cities",
    {
      eventId: "333",
      result: "single",
      region: "Canada",
      gender: ["f"],
    },
  ),
  ...["competitors", "competitions", "solves"].map((stat) =>
    scenario(`${stat}-world`, `city ${stat} world`, "/api/rankings/cities", {
      eventId: "333",
      result: "single",
      stat,
    }),
  ),
  scenario(
    "competitors-canada",
    "city competitors Canada",
    "/api/rankings/cities",
    {
      eventId: "333",
      result: "single",
      stat: "competitors",
      region: "Canada",
    },
  ),
  scenario("solves-world-f", "city solves women", "/api/rankings/cities", {
    eventId: "333",
    result: "single",
    stat: "solves",
    gender: ["f"],
  }),
];

export const MEDAL_RANKING_SCENARIOS = [
  scenario(
    "overall-all-events-world",
    "all-event overall medals",
    "/api/rankings/people/medals",
    { medal: "overall", paged: "1" },
  ),
  scenario(
    "gold-333-world",
    "3x3x3 gold medals",
    "/api/rankings/people/medals",
    { eventId: "333", medal: "gold", paged: "1" },
  ),
  scenario(
    "bronze-usa",
    "United States bronze medals",
    "/api/rankings/people/medals",
    { medal: "bronze", region: "USA", paged: "1" },
  ),
  scenario(
    "silver-all-events-women",
    "women's silver medals",
    "/api/rankings/people/medals",
    { medal: "silver", gender: ["f"], paged: "1" },
  ),
  scenario(
    "gold-333-2024-women-france",
    "2024 French women's 3x3x3 gold medals",
    "/api/rankings/people/medals",
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
