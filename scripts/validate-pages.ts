type PageCheck = {
  name: string;
  path: string;
  expected: string[];
};

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const DEFAULT_PERSON_ID = "2016HOOV01";
const DEFAULT_TIMEOUT_MS = 15_000;

function argumentValue(name: string) {
  const prefix = `--${name}=`;
  return (
    process.argv
      .find((value) => value.startsWith(prefix))
      ?.slice(prefix.length) ?? ""
  );
}

function pageChecks(personId: string): PageCheck[] {
  const checks = [
    {
      name: "people: 3x3 single",
      path: "/?eventId=333&result=single",
      expected: [
        "3x3x3 Cube Single Rankings | WCA Rankings",
        "Browse 3x3x3 cube single rankings from the World Cube Association.",
      ],
    },
    {
      name: "people: 3x3 average",
      path: "/?eventId=333&result=average",
      expected: [
        "3x3x3 Cube Average Rankings | WCA Rankings",
        "Browse 3x3x3 cube average rankings from the World Cube Association.",
      ],
    },
    {
      name: "results: 3x3 single",
      path: "/results?eventId=333&result=single",
      expected: [
        "3x3x3 Cube Single Results | WCA Rankings",
        "Browse 3x3x3 cube single results from the World Cube Association.",
      ],
    },
    {
      name: "persons: competition count",
      path: "/persons/competitions",
      expected: [
        "People by Competition Count | WCA Rankings",
        "Browse people by competition count from the World Cube Association.",
      ],
    },
    {
      name: "persons: gold medals",
      path: "/persons/medals?eventId=333&medal=gold",
      expected: [
        "3x3x3 Cube Gold Medal Rankings | WCA Rankings",
        "Browse 3x3x3 cube gold medal rankings from the World Cube Association.",
      ],
    },
    {
      name: "persons: yearly rankings",
      path: "/persons/year/2024?eventId=333&result=single",
      expected: [
        "3x3x3 Cube Single Rankings 2024 | WCA Rankings",
        "Browse 3x3x3 cube single rankings 2024 from the World Cube Association.",
      ],
    },
    {
      name: "competitions: best results",
      path: "/competitions/best-result",
      expected: [
        "Competition Best Results | WCA Rankings",
        "Browse competition best results from the World Cube Association.",
      ],
    },
    {
      name: "competitions: competitor count",
      path: "/competitions/competitor-count",
      expected: [
        "Competition Competitor Counts | WCA Rankings",
        "Browse competition competitor counts from the World Cube Association.",
      ],
    },
    {
      name: "competitions: latitude",
      path: "/competitions/latitude",
      expected: [
        "Northernmost and Southernmost Competitions | WCA Rankings",
        "Browse northernmost and southernmost competitions from the World Cube Association.",
      ],
    },
    {
      name: "competitions: podiums",
      path: "/competitions/podiums?eventId=333",
      expected: [
        "3x3x3 Cube Average Competition Podiums | WCA Rankings",
        "Browse 3x3x3 cube average competition podiums from the World Cube Association.",
      ],
    },
    {
      name: "cities: fastest single",
      path: "/cities/fastest-single?eventId=333",
      expected: [
        "3x3x3 Cube Fastest Single Cities | WCA Rankings",
        "Browse 3x3x3 cube fastest single cities from the World Cube Association.",
      ],
    },
    {
      name: "cities: fastest average",
      path: "/cities/fastest-average?eventId=333",
      expected: [
        "3x3x3 Cube Fastest Average Cities | WCA Rankings",
        "Browse 3x3x3 cube fastest average cities from the World Cube Association.",
      ],
    },
    {
      name: "cities: competitor count",
      path: "/cities/competitors",
      expected: [
        "Cities by Competitor Count | WCA Rankings",
        "Browse cities by competitor count from the World Cube Association.",
      ],
    },
    {
      name: "cities: competition count",
      path: "/cities/competitions",
      expected: [
        "Cities by Competition Count | WCA Rankings",
        "Browse cities by competition count from the World Cube Association.",
      ],
    },
    {
      name: "cities: official solve count",
      path: "/cities/solves",
      expected: [
        "Cities by Official Solve Count | WCA Rankings",
        "Browse cities by official solve count from the World Cube Association.",
      ],
    },
    {
      name: "person profile",
      path: `/person/${encodeURIComponent(personId)}`,
      expected: ["Competitor profile"],
    },
  ];
  return checks.map((check) =>
    check.name === "person profile"
      ? check
      : { ...check, expected: [...check.expected, "Top 3 results:"] },
  );
}

async function checkPage(baseUrl: string, check: PageCheck, timeoutMs: number) {
  const url = new URL(check.path, baseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();
  try {
    const response = await fetch(url, { signal: controller.signal });
    const body = await response.text();
    const missing = check.expected.filter((value) => !body.includes(value));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (missing.length) throw new Error(`missing: ${missing.join(", ")}`);
    return { elapsedMs: Math.round(performance.now() - startedAt) };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const baseUrl =
    argumentValue("base-url") || process.env.BASE_URL || DEFAULT_BASE_URL;
  const personId = argumentValue("person-id") || DEFAULT_PERSON_ID;
  const timeoutMs = Number(argumentValue("timeout-ms") || DEFAULT_TIMEOUT_MS);
  const checks = pageChecks(personId);
  let failures = 0;

  for (const check of checks) {
    try {
      const result = await checkPage(baseUrl, check, timeoutMs);
      console.log(`PASS ${result.elapsedMs}ms ${check.name}`);
    } catch (error) {
      failures += 1;
      console.error(
        `FAIL ${check.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  console.log(`\n${checks.length - failures}/${checks.length} pages passed.`);
  if (failures) process.exitCode = 1;
}

if (import.meta.main) await main();
