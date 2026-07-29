import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getAuthUser } from "@/lib/auth";
import { loadListRankings } from "@/lib/list-rankings";
import {
  getListRegions,
  hasMultipleListCountries,
  normalizeListRegionSelection,
} from "@/lib/list-regions";
import {
  assertCanViewList,
  ListNotFoundError,
  resolveList,
} from "@/lib/lists";
import { RankingsExplorer } from "@/components/RankingsExplorer/RankingsExplorer";
import { isEventId, isRankingType, parseRegionQuery } from "@/lib/wca";

export const dynamic = "force-dynamic";

async function getListPageData(listId: string) {
  try {
    const request = new Request("http://localhost", { headers: await headers() });
    const [list, user] = await Promise.all([
      resolveList(listId),
      getAuthUser(request),
    ]);
    assertCanViewList(list, user);
    const regions = await getListRegions(list);
    return { list, regions, user };
  } catch (error) {
    if (error instanceof ListNotFoundError) notFound();
    throw error;
  }
}

export default async function ListPage({
  params,
  searchParams,
}: {
  params: Promise<{ listId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { listId } = await params;
  const query = await searchParams;
  const eventValue = typeof query.eventId === "string" ? query.eventId : "333";
  const resultValue = typeof query.result === "string" ? query.result : "single";
  const eventId = isEventId(eventValue) ? eventValue : "333";
  const rankingType = eventId === "333mbf" || !isRankingType(resultValue)
    ? "single"
    : resultValue;
  const regionValue = typeof query.region === "string" ? query.region : null;
  const requestedRegionSelection = parseRegionQuery(regionValue);
  const { list, regions, user } = await getListPageData(listId);
  const regionSelection = normalizeListRegionSelection(
    requestedRegionSelection,
    regions,
  );
  const rankingParams = new URLSearchParams({
    eventId,
    result: rankingType,
    limit: "50",
  });
  if (regionSelection.scope !== "world") rankingParams.set("region", regionSelection.regionId);
  const rankings = await loadListRankings(list, rankingParams);
  const rankingListId = list.systemAlias ?? list.publicId;
  if (!rankingListId) notFound();
  return (
    <RankingsExplorer
      initialData={{
        entries: rankings.entries,
        hasMore: rankings.hasMore,
        nextPageStart: rankings.nextStart === null ? null : rankings.nextStart + 1,
        previousPageStart: null,
        startPosition: 0,
        lastRank: rankings.entries.at(-1)?.subRank ?? null,
        total: rankings.total,
        exportDate: rankings.exportDate,
        startRank: 1,
        searchMatches: [],
        initialMatchPersonId: "",
      }}
      rankingSource={{ listId: rankingListId, listName: list.name }}
      listOwner={list.kind === "user" && list.owner?.id === user?.id && list.publicId ? { listId: list.publicId, visibility: list.visibility } : undefined}
      initialEventId={eventId}
      initialRankingType={rankingType}
      initialRegionSelection={regionSelection}
      initialRegions={regions}
      regionSelectionDisabled={!hasMultipleListCountries(regions)}
    />
  );
}
