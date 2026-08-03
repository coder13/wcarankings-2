"use client";

import { useCallback, useState } from "react";
import type { RankingsFilterState } from "./rankingsUrl";
import type { InitialRankingData, RankingSource } from "./types";
import { useListMemberManagement } from "./useListMemberManagement";
import { useRankingDataSource } from "./useRankingDataSource";
import { useRankingListOffset } from "./useRankingListOffset";
import { useVirtualRankings } from "./useVirtualRankings";

export function useRankingDataRuntime({
  filters,
  initialData,
  source,
  ownerListId,
}: {
  filters: RankingsFilterState;
  initialData?: InitialRankingData;
  source?: RankingSource;
  ownerListId?: string;
}) {
  const dataSource = useRankingDataSource({ filters, source, initialData });
  const [initialDataset] = useState({
    key: dataSource.listKey,
    data: initialData,
  });
  const listOffset = useRankingListOffset();
  const rankings = useVirtualRankings({
    datasetKey: dataSource.listKey,
    api: dataSource.rangeApi,
    initialData:
      initialDataset.key === dataSource.listKey
        ? initialDataset.data
        : undefined,
    listOffset,
    expandableRows:
      filters.subject === "people" && !filters.personCompetitionRanking,
  });
  const reload = useCallback(() => {
    void rankings.reload();
  }, [rankings]);
  const listMembers = useListMemberManagement({
    listId: ownerListId,
    onRemoved: reload,
  });

  return { dataSource, rankings, reload, listMembers };
}
