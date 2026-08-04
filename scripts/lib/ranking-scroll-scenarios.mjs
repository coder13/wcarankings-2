function scenario(id, label, path, params) {
  return { id, label, path, params };
}

export const PERSON_RANKING_SCENARIOS = [
  scenario("event-single-world", "precomputed person world single", "/api/rankings", {
    eventId: "333",
    result: "single",
    paged: "1",
  }),
  scenario("event-average-world", "precomputed person world average", "/api/rankings", {
    eventId: "333",
    result: "average",
    paged: "1",
  }),
  scenario("event-single-world-2023", "precomputed person world single year", "/api/rankings", {
    eventId: "333",
    result: "single",
    year: "2023",
    paged: "1",
  }),
  ...["Canada", "China", "USA"].map((region) =>
    scenario(
      `event-single-${region.toLowerCase()}`,
      `precomputed person ${region} single`,
      "/api/rankings",
      { eventId: "333", result: "single", region, paged: "1" },
    ),
  ),
  scenario("event-single-world-f", "filtered person world women", "/api/rankings", {
    eventId: "333",
    result: "single",
    gender: ["f"],
    paged: "1",
  }),
  scenario("event-single-world-fo", "filtered person world female-other", "/api/rankings", {
    eventId: "333",
    result: "single",
    gender: ["f", "o"],
    paged: "1",
  }),
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
  scenario("sum-of-ranks-single-world", "primed Sum of Ranks world single", "/api/rankings", {
    eventId: "SOR",
    result: "single",
    paged: "1",
  }),
  scenario("sum-of-ranks-average-world", "primed Sum of Ranks world average", "/api/rankings", {
    eventId: "SOR",
    result: "average",
    paged: "1",
  }),
  scenario("sum-of-ranks-single-canada", "primed Sum of Ranks Canada single", "/api/rankings", {
    eventId: "SOR",
    result: "single",
    region: "Canada",
    paged: "1",
  }),
  scenario("sum-of-ranks-single-world-f", "lazy Sum of Ranks world women", "/api/rankings", {
    eventId: "SOR",
    result: "single",
    gender: ["f"],
    paged: "1",
  }),
  scenario("kinch-world", "primed Kinch world", "/api/rankings", {
    eventId: "sor-kinch",
    result: "single",
    paged: "1",
  }),
  scenario("kinch-canada-regional", "primed Kinch Canada regional order", "/api/rankings", {
    eventId: "sor-kinch",
    result: "single",
    region: "Canada",
    paged: "1",
  }),
  scenario("kinch-canada-continent", "primed Kinch Canada continent order", "/api/rankings", {
    eventId: "sor-kinch",
    result: "single",
    region: "Canada",
    kinch: "continent",
    paged: "1",
  }),
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
    { eventId: "333", result: "single", region: "Canada", gender: ["f"], paged: "1" },
  ),
];

export const RESULT_RANKING_SCENARIOS = [
  scenario("single-world", "precomputed result world single", "/api/rankings/results", {
    eventId: "333",
    result: "single",
  }),
  scenario("average-world", "precomputed result world average", "/api/rankings/results", {
    eventId: "333",
    result: "average",
  }),
  scenario("single-world-2023", "lazy result world single year", "/api/rankings/results", {
    eventId: "333",
    result: "single",
    year: "2023",
  }),
  ...["Canada", "China", "USA"].map((region) =>
    scenario(
      `single-${region.toLowerCase()}`,
      `result ${region} single`,
      "/api/rankings/results",
      { eventId: "333", result: "single", region },
    ),
  ),
  scenario("single-world-f", "lazy result world women", "/api/rankings/results", {
    eventId: "333",
    result: "single",
    gender: ["f"],
  }),
  scenario("average-world-f", "lazy result world women average", "/api/rankings/results", {
    eventId: "333",
    result: "average",
    gender: ["f"],
  }),
  scenario("single-world-fo", "lazy result world female-other", "/api/rankings/results", {
    eventId: "333",
    result: "single",
    gender: ["f", "o"],
  }),
  ...["Canada", "China", "USA"].map((region) =>
    scenario(
      `average-${region.toLowerCase()}-2023-fo`,
      `lazy result ${region} female-other average 2023`,
      "/api/rankings/results",
      { eventId: "333", result: "average", region, year: "2023", gender: ["f", "o"] },
    ),
  ),
];

export const COMPETITION_RANKING_SCENARIOS = [
  scenario("fastest-single", "fastest competition single", "/api/rankings/competitions", {
    eventId: "333",
    result: "single",
    ranking: "fastest",
  }),
  scenario("fastest-average", "fastest competition average", "/api/rankings/competitions", {
    eventId: "333",
    result: "average",
    ranking: "fastest",
  }),
  scenario("podium", "competition podium", "/api/rankings/competitions", {
    eventId: "333",
    result: "average",
    ranking: "podium",
  }),
  scenario("competitor-count", "competition competitor count", "/api/rankings/competitions", {
    eventId: "333",
    result: "single",
    ranking: "competitor-count",
  }),
  scenario("latitude-north", "northernmost competitions", "/api/rankings/competitions", {
    eventId: "333",
    result: "single",
    ranking: "latitude",
    hemisphere: "north",
  }),
  scenario("latitude-south", "southernmost competitions", "/api/rankings/competitions", {
    eventId: "333",
    result: "single",
    ranking: "latitude",
    hemisphere: "south",
  }),
  scenario("latitude-north-canada", "northernmost Canada competitions", "/api/rankings/competitions", {
    eventId: "333",
    result: "single",
    ranking: "latitude",
    hemisphere: "north",
    region: "Canada",
  }),
];

export const CITY_RANKING_SCENARIOS = [
  scenario("fastest-single-world", "fastest city single world", "/api/rankings/cities", {
    eventId: "333",
    result: "single",
  }),
  scenario("fastest-average-world", "fastest city average world", "/api/rankings/cities", {
    eventId: "333",
    result: "average",
  }),
  scenario("fastest-single-canada", "fastest city single Canada", "/api/rankings/cities", {
    eventId: "333",
    result: "single",
    region: "Canada",
  }),
  scenario("fastest-single-world-f", "fastest city single women", "/api/rankings/cities", {
    eventId: "333",
    result: "single",
    gender: ["f"],
  }),
  scenario("fastest-single-canada-f", "fastest city single Canada women", "/api/rankings/cities", {
    eventId: "333",
    result: "single",
    region: "Canada",
    gender: ["f"],
  }),
  ...["competitors", "competitions", "solves"].map((stat) =>
    scenario(`${stat}-world`, `city ${stat} world`, "/api/rankings/cities", {
      eventId: "333",
      result: "single",
      stat,
    }),
  ),
  scenario("competitors-canada", "city competitors Canada", "/api/rankings/cities", {
    eventId: "333",
    result: "single",
    stat: "competitors",
    region: "Canada",
  }),
  scenario("solves-world-f", "city solves women", "/api/rankings/cities", {
    eventId: "333",
    result: "single",
    stat: "solves",
    gender: ["f"],
  }),
];

export const RANKING_SCROLL_SUITES = {
  persons: PERSON_RANKING_SCENARIOS,
  results: RESULT_RANKING_SCENARIOS,
  competitions: COMPETITION_RANKING_SCENARIOS,
  cities: CITY_RANKING_SCENARIOS,
};

export const ALL_RANKING_SCROLL_SCENARIOS = Object.entries(RANKING_SCROLL_SUITES).flatMap(
  ([suite, scenarios]) => scenarios.map((entry) => ({ ...entry, suite })),
);
