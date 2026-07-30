import { headers } from "next/headers";
import { RankingsExplorer } from "@/components/RankingsExplorer/RankingsExplorer";
import {
  DynamicListInputError,
  parseDynamicListIds,
  resolveDynamicList,
} from "@/lib/dynamic-list";
import { getDynamicListRegions, hasMultipleListCountries, normalizeListRegionSelection } from "@/lib/list-regions";
import { loadDynamicListRankings } from "@/lib/list-rankings";
import { getAuthUser } from "@/lib/auth";
import { isEventId, isRankingType, normalizeGenderFilters, parseRegionQuery, type GenderFilter } from "@/lib/wca";

export const dynamic = "force-dynamic";

function messageFor(invalidIds: string[], unknownIds: string[]) {
  const parts = [
    invalidIds.length ? `${invalidIds.length} invalid WCA ${invalidIds.length === 1 ? "ID was" : "IDs were"} ignored` : "",
    unknownIds.length ? `${unknownIds.length} unknown WCA ${unknownIds.length === 1 ? "ID was" : "IDs were"} ignored` : "",
  ].filter(Boolean);
  return parts.length ? `${parts.join("; ")}.` : "";
}

export default async function DynamicListPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const eventValue = typeof query.eventId === "string" ? query.eventId : "333";
  const eventId = isEventId(eventValue) ? eventValue : "333";
  const resultValue = typeof query.result === "string" ? query.result : "single";
  const rankingType = eventId === "333mbf" || !isRankingType(resultValue) ? "single" : resultValue;
  const requestedRegion = parseRegionQuery(typeof query.region === "string" ? query.region : null);
  const gender = normalizeGenderFilters(
    (Array.isArray(query.gender) ? query.gender : query.gender ? [query.gender] : [])
      .flatMap((value) => value.split(","))
      .filter((value): value is GenderFilter => value === "m" || value === "f" || value === "o"),
  );
  let personIds: string[] = [];
  let notice = "";
  try {
    const parsed = parseDynamicListIds(query.wca_ids);
    const resolved = await resolveDynamicList(parsed.personIds);
    personIds = resolved.personIds;
    notice = messageFor(parsed.invalidIds, resolved.unknownIds);
  } catch (error) {
    notice = error instanceof DynamicListInputError ? error.message : "Could not read this dynamic list.";
  }
  const [regions, rankings, user] = await Promise.all([
    getDynamicListRegions(personIds),
    loadDynamicListRankings(personIds, new URLSearchParams({ eventId, result: rankingType, limit: "50", ...(gender.length ? { gender: gender.join(",") } : {}) })),
    getAuthUser(new Request("http://localhost", { headers: await headers() })),
  ]);
  const regionSelection = normalizeListRegionSelection(requestedRegion, regions);
  if (regionSelection.scope !== "world") {
    const filtered = await loadDynamicListRankings(personIds, new URLSearchParams({ eventId, result: rankingType, region: regionSelection.regionId, limit: "50", ...(gender.length ? { gender: gender.join(",") } : {}) }));
    rankings.entries = filtered.entries;
    rankings.hasMore = filtered.hasMore;
    rankings.nextStart = filtered.nextStart;
    rankings.total = filtered.total;
  }
  const emptyNotice = !personIds.length && !notice ? "Add comma-separated WCA IDs with the wca_ids query parameter." : notice;
  return <RankingsExplorer initialData={{ entries: rankings.entries, hasMore: rankings.hasMore, nextPageStart: rankings.nextStart === null ? null : rankings.nextStart + 1, previousPageStart: null, startPosition: 0, lastRank: rankings.entries.at(-1)?.subRank ?? null, total: rankings.total, exportDate: rankings.exportDate, startRank: 1, searchMatches: [], initialMatchPersonId: "" }} rankingSource={{ kind: "dynamic", personIds, listName: "Dynamic list" }} dynamicList={personIds.length ? { personIds } : undefined} listNotice={emptyNotice || undefined} showMyRank={Boolean(user && personIds.includes(user.wcaId))} initialEventId={eventId} initialRankingType={rankingType} initialGender={gender} initialRegionSelection={regionSelection} initialRegions={regions} regionSelectionDisabled={!hasMultipleListCountries(regions)} />;
}
