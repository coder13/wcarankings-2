type PageCheck = {
  name: string;
  path: string;
  expected: string[];
  capability?: CapabilityName;
};

type CapabilityName =
  | "personCompetitionRankings"
  | "personMedalRankings";

type HealthResponse = {
  generation?: {
    capabilities?: Partial<Record<CapabilityName, { status: string }>>;
  } | null;
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
  const checks: PageCheck[] = [
    {
      name: "people: 3x3 single",
      path: "/?eventId=333&result=single",
      expected: ["3x3x3 Cube Single Rankings | WCA Rankings"],
    },
    {
      name: "people: 3x3 average",
      path: "/?eventId=333&result=average",
      expected: ["3x3x3 Cube Average Rankings | WCA Rankings"],
    },
    {
      name: "results: 3x3 single",
      path: "/results?eventId=333&result=single",
      expected: ["3x3x3 Cube Single Results | WCA Rankings"],
    },
    {
      name: "persons: competition count",
      path: "/persons/competitions",
      capability: "personCompetitionRankings",
      expected: ["People by Competition Count | WCA Rankings"],
    },
    {
      name: "persons: gold medals",
      path: "/persons/medals?eventId=333&medal=gold",
      capability: "personMedalRankings",
      expected: ["3x3x3 Cube Gold Medal Rankings | WCA Rankings"],
    },
    {
      name: "persons: yearly rankings",
      path: "/persons/year/2024?eventId=333&result=single",
      expected: ["3x3x3 Cube Single Rankings 2024 | WCA Rankings"],
    },
    {
      name: "competitions: best results",
      path: "/competitions/best-result",
      expected: ["Competition Best Results | WCA Rankings"],
    },
    {
      name: "competitions: competitor count",
      path: "/competitions/competitor-count",
      expected: ["Competition Competitor Counts | WCA Rankings"],
    },
    {
      name: "competitions: latitude",
      path: "/competitions/latitude",
      expected: ["Northernmost and Southernmost Competitions | WCA Rankings"],
    },
    {
      name: "competitions: podiums",
      path: "/competitions/podiums?eventId=333",
      expected: ["3x3x3 Cube Average Competition Podiums | WCA Rankings"],
    },
    {
      name: "cities: fastest single",
      path: "/cities/fastest-single?eventId=333",
      expected: ["3x3x3 Cube Fastest Single Cities | WCA Rankings"],
    },
    {
      name: "cities: fastest average",
      path: "/cities/fastest-average?eventId=333",
      expected: ["3x3x3 Cube Fastest Average Cities | WCA Rankings"],
    },
    {
      name: "cities: competitor count",
      path: "/cities/competitors",
      expected: ["Cities by Competitor Count | WCA Rankings"],
    },
    {
      name: "cities: competition count",
      path: "/cities/competitions",
      expected: ["Cities by Competition Count | WCA Rankings"],
    },
    {
      name: "cities: official solve count",
      path: "/cities/solves",
      expected: ["Cities by Official Solve Count | WCA Rankings"],
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
      : check,
  );
}

async function checkPage(
  baseUrl: string,
  check: PageCheck,
  timeoutMs: number,
  enabledCapabilities: Set<CapabilityName>,
) {
  if (check.capability && !enabledCapabilities.has(check.capability)) {
    return { skipped: true, elapsedMs: 0 };
  }
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
    if (check.name !== "person profile") {
      const descriptions = [
        body.match(/<meta name="description" content="([^"]*)"/)?.[1],
        body.match(/<meta property="og:description" content="([^"]*)"/)?.[1],
        body.match(/<meta name="twitter:description" content="([^"]*)"/)?.[1],
      ];
      if (descriptions.some((description) => !description)) {
        throw new Error("missing SSR descriptions");
      }
      if (
        descriptions.some(
          (description) =>
            description?.includes("Browse") ||
            description?.includes("Top 3 results"),
        )
      ) {
        throw new Error("SSR description contains a removed label");
      }
      if (descriptions.some((description) => description?.split("\n").length !== 3)) {
        throw new Error("SSR description does not contain three result lines");
      }
    }
    return { skipped: false, elapsedMs: Math.round(performance.now() - startedAt) };
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
  const healthResponse = await fetch(new URL("/api/admin/health", baseUrl));
  if (!healthResponse.ok) {
    throw new Error(`Health check failed with HTTP ${healthResponse.status}`);
  }
  const health = (await healthResponse.json()) as HealthResponse;
  const enabledCapabilities = new Set<CapabilityName>();
  for (const capability of [
    "personCompetitionRankings",
    "personMedalRankings",
  ] as const) {
    if (health.generation?.capabilities?.[capability]?.status === "enabled") {
      enabledCapabilities.add(capability);
    }
  }
  let failures = 0;
  let skipped = 0;

  for (const check of checks) {
    try {
      const result = await checkPage(
        baseUrl,
        check,
        timeoutMs,
        enabledCapabilities,
      );
      if (result.skipped) {
        skipped += 1;
        console.log(`SKIP ${check.name}: projection capability unavailable`);
      } else {
        console.log(`PASS ${result.elapsedMs}ms ${check.name}`);
      }
    } catch (error) {
      failures += 1;
      console.error(
        `FAIL ${check.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  console.log(
    `\n${checks.length - failures - skipped}/${checks.length - skipped} pages passed; ${skipped} skipped.`,
  );
  if (failures) process.exitCode = 1;
}

if (import.meta.main) await main();
