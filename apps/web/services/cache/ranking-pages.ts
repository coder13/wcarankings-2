import { readRedisJson, writeRedisJson } from "./redis";

const REDIS_RANKING_PAGE_SIZE = 50;
const RANKING_WINDOW_SIZE = 400;

type RankingWindowValue = {
  data: {
    entries: unknown[];
    total: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

function pageKey(windowKey: string, pageStart: number) {
  return `ranking-window:${windowKey}:page:${pageStart}`;
}

export async function readRankingWindowPages<T extends RankingWindowValue>(
  windowKey: string,
  windowStart: number,
) {
  const starts = Array.from(
    { length: RANKING_WINDOW_SIZE / REDIS_RANKING_PAGE_SIZE },
    (_, index) => windowStart + index * REDIS_RANKING_PAGE_SIZE,
  );
  const pages = await Promise.all(
    starts.map((start) => readRedisJson<T>(pageKey(windowKey, start))),
  );
  if (pages.some((page) => page === null)) return null;
  const first = pages[0];
  if (!first) return null;
  return {
    ...first,
    data: {
      ...first.data,
      entries: pages.flatMap((page) => page?.data.entries ?? []),
    },
  } as T;
}

export async function writeRankingWindowPages(
  windowKey: string,
  windowStart: number,
  value: RankingWindowValue,
) {
  const writes = Array.from(
    { length: RANKING_WINDOW_SIZE / REDIS_RANKING_PAGE_SIZE },
    (_, index) => {
      const start = index * REDIS_RANKING_PAGE_SIZE;
      return writeRedisJson(pageKey(windowKey, windowStart + start), {
        ...value,
        data: {
          ...value.data,
          entries: value.data.entries.slice(
            start,
            start + REDIS_RANKING_PAGE_SIZE,
          ),
        },
      });
    },
  );
  await Promise.all(writes);
}
