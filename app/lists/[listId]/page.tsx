import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getAuthUser } from "@/services/auth/auth";
import { loadListRankings } from "@/services/lists/rankings";
import {
  getListRegions,
  hasMultipleListCountries,
  normalizeListRegionSelection,
} from "@/services/lists/regions";
import {
  assertCanViewList,
  getListMembershipState,
  listMembershipRequests,
  ListNotFoundError,
  resolveList,
} from "@/services/lists/lists";
import { RankingsExplorer } from "@/components/RankingsExplorer/RankingsExplorer";
import { isEventId, isRankingType, normalizeGenderFilters, parseRegionQuery, type GenderFilter } from "@/lib/wca";

export const dynamic = "force-dynamic";

async function getListPageData(listId: string) {
  try {
    const [list, user] = await Promise.all([
      resolveList(listId),
      getAuthUser(new Request("http://localhost", { headers: await headers() })),
    ]);
    assertCanViewList(list, user);
    const isOwner = list.kind === "user" && list.owner?.id === user?.id;
    const [regions, membershipState, membershipRequests] = await Promise.all([
      getListRegions(list),
      getListMembershipState(list, user),
      isOwner && user ? listMembershipRequests(user, listId) : Promise.resolve([]),
    ]);
    return { list, regions, user, isOwner, membershipState, membershipRequests };
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
  const gender = normalizeGenderFilters(
    (Array.isArray(query.gender) ? query.gender : query.gender ? [query.gender] : [])
      .flatMap((value) => value.split(","))
      .filter((value): value is GenderFilter => value === "m" || value === "f" || value === "o"),
  );
  const { list, regions, user, isOwner, membershipState, membershipRequests } = await getListPageData(listId);
  const regionSelection = normalizeListRegionSelection(
    parseRegionQuery(typeof query.region === "string" ? query.region : null),
    regions,
  );
  const rankingParams = new URLSearchParams({
    eventId,
    result: rankingType,
    limit: "50",
  });
  if (regionSelection.scope !== "world") rankingParams.set("region", regionSelection.regionId);
  if (gender.length) rankingParams.set("gender", gender.join(","));
  const rankings = await loadListRankings(list, rankingParams);
  const rankingListId = list.systemAlias ?? list.publicId;
  if (!rankingListId) notFound();
  return (
    <RankingsExplorer
        initial={{
          data: {
            entries: rankings.entries,
            hasMore: rankings.hasMore,
            nextPageStart: rankings.nextStart === null
              ? null
              : rankings.nextStart + 1,
            previousPageStart: null,
            startPosition: 0,
            lastRank: rankings.entries.at(-1)?.subRank ?? null,
            total: rankings.total,
            exportDate: rankings.exportDate,
            startRank: 1,
          },
          regions,
        }}
        source={{ kind: "saved", listId: rankingListId, listName: list.name }}
        options={{
          showMyRank: membershipState === "member",
          regionSelectionDisabled: !hasMultipleListCountries(regions),
        }}
        list={{
          owner: list.kind === "user" &&
              list.owner?.id === user?.id &&
              list.publicId
            ? {
                listId: list.publicId,
                visibility: list.visibility,
                joinPolicy: list.joinPolicy,
              }
            : undefined,
          membership: list.kind === "user" &&
              list.owner?.id !== user?.id &&
              list.publicId &&
              membershipState
            ? {
                listId: list.publicId,
                joinPolicy: list.joinPolicy,
                state: membershipState,
              }
            : undefined,
          membershipRequests: list.kind === "user" &&
              list.owner?.id === user?.id &&
              list.publicId
            ? { listId: list.publicId, requests: membershipRequests }
            : undefined,
          actions: list.publicId
            ? { listId: list.publicId, isOwner }
            : undefined,
        }}
    />
  );
}
