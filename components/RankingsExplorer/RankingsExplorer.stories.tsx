import { useLayoutEffect, type ReactNode } from "react";
import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { FALLBACK_CONTINENTS, FALLBACK_COUNTRIES } from "@/lib/wca";
import type { RecordBadgeCode } from "@/lib/wca";
import { RankingsExplorer } from "./RankingsExplorer";
import type { RankingEntry } from "./types";

const MOCK_RANKING_SIZE = 10_000;
const MOCK_FETCHED_AT = "2026-07-27T00:00:00.000Z";
const firstNames = [
  "Avery",
  "Casey",
  "Jordan",
  "Mina",
  "Noah",
  "Riley",
  "Sasha",
  "Taylor",
];
const lastNames = [
  "Adams",
  "Chen",
  "Garcia",
  "Kim",
  "Martin",
  "Patel",
  "Silva",
  "Walker",
];

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function makeMockRankings(): RankingEntry[] {
  const random = seededRandom(0xc0be4a11);
  let previousBest: number | undefined;
  let previousRank = 0;

  return Array.from({ length: MOCK_RANKING_SIZE }, (_, index) => ({
    personName: `${firstNames[index % firstNames.length]} ${
      lastNames[Math.floor(index / firstNames.length) % lastNames.length]
    }`,
    personId: `${2000 + (index % 25)}${String(
      Math.floor(index / 100)
    ).padStart(4, "0")}${String(index % 100).padStart(2, "0")}`,
    best: Math.round((5 + random() * 395) * 100),
    competitionName: `Storybook Open ${2020 + (index % 7)}`,
  }))
    .sort((left, right) => left.best - right.best)
    .map((entry, index, sortedEntries) => {
      const previousEntry = sortedEntries[index - 1];
      const hasMockTie = index > 0 && index % 17 === 0;
      const best = hasMockTie ? previousEntry.best : entry.best;
      const rank = previousBest === best ? previousRank : index + 1;
      previousBest = best;
      previousRank = rank;

      return {
        ...entry,
        best,
        rank,
        subRank: index + 1,
        competitionId: `storybook-${index % 7}`,
        countryName: ["United States", "Canada", "Japan", "Germany"][index % 4],
        countryIso2: ["US", "CA", "JP", "DE"][index % 4],
        recordBadges: (index === 0 ? ["WR", "NR"] : index % 31 === 0 ? ["NR"] : []) as RecordBadgeCode[],
      };
    });
}

const allEntries = makeMockRankings();
const entries = allEntries.slice(0, 100);

function makeMockResponse(url: URL, init?: RequestInit) {
  if (init?.signal?.aborted) {
    return Promise.reject(new DOMException("Request aborted", "AbortError"));
  }

  const search = url.searchParams.get("search")?.trim().toLocaleLowerCase();
  if (search) {
    const searchPage = Math.max(0, Number(url.searchParams.get("searchPage")) || 0);
    const matches = allEntries.filter(
      (entry) =>
        entry.personName.toLocaleLowerCase().includes(search) ||
        entry.personId.toLocaleLowerCase().includes(search)
    );
    return Promise.resolve(
      new Response(
        JSON.stringify({
          entries: matches.slice(searchPage * 50, (searchPage + 1) * 50),
          total: matches.length,
        }),
        { headers: { "Content-Type": "application/json" } }
      )
    );
  }

  const requestedStart = Math.max(
    1,
    Number(url.searchParams.get("start")) || 1
  );
  const limit = Math.max(1, Number(url.searchParams.get("limit")) || 100);
  const focusPersonId = url.searchParams.get("focus");
  const focusIndex = focusPersonId
    ? allEntries.findIndex((entry) => entry.personId === focusPersonId)
    : -1;
  const focusBefore = Number(url.searchParams.get("focusBefore")) || 50;
  const start = focusIndex >= 0 ? Math.max(1, focusIndex + 1 - focusBefore) : requestedStart;
  const pageEntries = allEntries.slice(start - 1, start - 1 + limit);

  return Promise.resolve(
    new Response(
      JSON.stringify({
        entries: pageEntries,
        hasMore: start - 1 + pageEntries.length < allEntries.length,
        nextPageStart:
          start - 1 + pageEntries.length < allEntries.length
            ? start + pageEntries.length
            : null,
        previousPageStart: start > 1 ? Math.max(1, start - limit) : null,
        startPosition: start - 1,
        lastRank: pageEntries.at(-1)?.rank ?? null,
        total: allEntries.length,
        fetchedAt: MOCK_FETCHED_AT,
      }),
      { headers: { "Content-Type": "application/json" } }
    )
  );
}

function getRequestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function StorybookFetchMock({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = ((input, init) => {
      const requestUrl = new URL(getRequestUrl(input), window.location.href);
      if (requestUrl.pathname === "/api/rankings") {
        return makeMockResponse(requestUrl, init);
      }
      return originalFetch(input, init);
    }) as typeof window.fetch;

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return children;
}

const mockFetchDecorator: Decorator = (Story) => (
  <StorybookFetchMock>
    <Story />
  </StorybookFetchMock>
);

const initialData = {
  entries,
  hasMore: true,
  nextPageStart: entries.length + 1,
  previousPageStart: null,
  startRank: 1,
  startPosition: 0,
  lastRank: entries.at(-1)?.rank ?? null,
  total: allEntries.length,
  fetchedAt: MOCK_FETCHED_AT,
  searchMatches: [],
  searchTotal: 0,
  initialMatchPersonId: "",
};

const meta = {
  title: "Rankings/RankingsExplorer",
  component: RankingsExplorer,
  parameters: {
    nextjs: {
      appDirectory: true,
    },
  },
  decorators: [mockFetchDecorator],
} satisfies Meta<typeof RankingsExplorer>;

export default meta;
type Story = StoryObj<typeof meta>;

const sharedArgs = {
  initialData,
  initialRegions: {
    continents: FALLBACK_CONTINENTS,
    countries: FALLBACK_COUNTRIES,
  },
};

export const WorldSingle: Story = {
  args: {
    ...sharedArgs,
    initialEventId: "333",
    initialRankingType: "single",
  },
};

export const WorldAverage: Story = {
  args: {
    ...sharedArgs,
    initialEventId: "333",
    initialRankingType: "average",
  },
};
