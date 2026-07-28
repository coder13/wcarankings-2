export const SEARCH_PAGE_SIZE = 50;

export function normalizeSearchPage(value: string | null) {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 0;
}
