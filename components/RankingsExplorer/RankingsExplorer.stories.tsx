import { useLayoutEffect, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { FALLBACK_CONTINENTS, FALLBACK_COUNTRIES } from "@/lib/wca";
import type { RecordBadgeCode } from "@/lib/wca";
import { RankingsExplorer } from "./RankingsExplorer";
import type { RankingEntry } from "./types";

const MOCK_RANKING_SIZE = 10_000;
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
    personId: `${2000 + (index % 25)}${String(Math.floor(index / 100)).padStart(
      4,
      "0",
    )}${String(index % 100).padStart(2, "0")}`,
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
        recordBadges: (() => {
          if (index === 0) return ["WR", "NR"] as RecordBadgeCode[];
          if (index % 31 === 0) return ["NR"] as RecordBadgeCode[];
          return [];
        })(),
      };
    });
}

const allEntries = makeMockRankings();
const entries = allEntries.slice(0, 100);
const countryEntries: RankingEntry[] = FALLBACK_COUNTRIES.map(
  (country, index) => ({
    rank: index + 1,
    subRank: index + 1,
    personId: `country:${country.id}`,
    personName: country.name,
    identitySubtitle: index % 2 ? "competitions" : "official solves",
    countryName: country.name,
    countryIso2:
      [
        "AU",
        "BR",
        "CA",
        "CN",
        "FR",
        "DE",
        "IN",
        "ID",
        "JP",
        "NL",
        "PH",
        "PL",
        "KR",
        "ES",
        "GB",
        "US",
      ][index] ?? "",
    best: 12_500 - index * 431,
    formattedValue: new Intl.NumberFormat("en-US").format(12_500 - index * 431),
    competitionId: "",
    competitionName: "",
    recordBadges: [],
  }),
);

function makeMockResponse(url: URL, init?: RequestInit) {
  if (init?.signal?.aborted) {
    return Promise.reject(new DOMException("Request aborted", "AbortError"));
  }

  const rankingEntries =
    url.pathname === "/api/rankings/countries" ? countryEntries : allEntries;

  const search = url.searchParams.get("search")?.trim().toLocaleLowerCase();
  if (search) {
    const searchLimit = Number(url.searchParams.get("searchLimit")) || 500;
    return Promise.resolve(
      new Response(
        JSON.stringify({
          entries: rankingEntries
            .filter(
              (entry) =>
                entry.personName.toLocaleLowerCase().includes(search) ||
                entry.personId.toLocaleLowerCase().includes(search),
            )
            .slice(0, searchLimit),
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );
  }

  const requestedStart = Math.max(
    1,
    Number(url.searchParams.get("start")) || 1,
  );
  const limit = Math.max(1, Number(url.searchParams.get("limit")) || 100);
  const focusPersonId = url.searchParams.get("focus");
  const focusIndex = focusPersonId
    ? rankingEntries.findIndex((entry) => entry.personId === focusPersonId)
    : -1;
  const focusBefore = Number(url.searchParams.get("focusBefore")) || 50;
  const start =
    focusIndex >= 0
      ? Math.max(1, focusIndex + 1 - focusBefore)
      : requestedStart;
  const pageEntries = rankingEntries.slice(start - 1, start - 1 + limit);

  return Promise.resolve(
    new Response(
      JSON.stringify({
        entries: pageEntries,
        hasMore: start - 1 + pageEntries.length < rankingEntries.length,
        nextPageStart:
          start - 1 + pageEntries.length < rankingEntries.length
            ? start + pageEntries.length
            : null,
        previousPageStart: start > 1 ? Math.max(1, start - limit) : null,
        startPosition: start - 1,
        lastRank: pageEntries.at(-1)?.rank ?? null,
        total: rankingEntries.length,
      }),
      { headers: { "Content-Type": "application/json" } },
    ),
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
      if (requestUrl.pathname.startsWith("/api/rankings")) {
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

const storybookQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
});

const queryClientDecorator: Decorator = (Story) => (
  <QueryClientProvider client={storybookQueryClient}>
    <Story />
  </QueryClientProvider>
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
};

const countryInitialData = {
  entries: countryEntries,
  hasMore: false,
  nextPageStart: null,
  previousPageStart: null,
  startRank: 1,
  startPosition: 0,
  lastRank: countryEntries.at(-1)?.rank ?? null,
  total: countryEntries.length,
};

const meta = {
  title: "Pages/RankingsExplorer",
  component: RankingsExplorer,
  parameters: {
    nextjs: {
      appDirectory: true,
    },
  },
  decorators: [queryClientDecorator, mockFetchDecorator],
} satisfies Meta<typeof RankingsExplorer>;

export default meta;
type Story = StoryObj<typeof meta>;

const sharedArgs = {
  initial: {
    data: initialData,
    regions: {
      continents: FALLBACK_CONTINENTS,
      countries: FALLBACK_COUNTRIES,
    },
  },
  options: {
    showAllEventRankingOptions: true,
    showSubjectSwitch: true,
  },
};

export const Persons: Story = {
  args: sharedArgs,
};

export const PersonsInfiniteScroll: Story = {
  args: sharedArgs,
  parameters: {
    docs: {
      description: {
        story:
          "Scroll through this 10,000-person fixture to exercise virtual rendering, page prefetching, and infinite loading.",
      },
    },
  },
};

export const Results: Story = {
  args: sharedArgs,
  parameters: {
    nextjs: { navigation: { pathname: "/results" } },
  },
};

export const CompetitionBestResults: Story = {
  args: sharedArgs,
  parameters: {
    nextjs: { navigation: { pathname: "/competitions/best-result" } },
  },
};

export const CompetitionPodiums: Story = {
  args: sharedArgs,
  parameters: {
    nextjs: { navigation: { pathname: "/competitions/podiums" } },
  },
};

export const CompetitionLatitude: Story = {
  args: sharedArgs,
  parameters: {
    nextjs: { navigation: { pathname: "/competitions/latitude" } },
  },
};

export const Countries: Story = {
  args: {
    ...sharedArgs,
    initial: { ...sharedArgs.initial, data: countryInitialData },
  },
  parameters: {
    nextjs: {
      navigation: {
        pathname: "/countries/solves",
        query: { eventId: "333", gender: "f,o", year: "2025" },
      },
    },
  },
};

export const SearchOpen: Story = {
  args: sharedArgs,
  parameters: {
    nextjs: { navigation: { pathname: "/", query: { search: "Avery" } } },
  },
};
