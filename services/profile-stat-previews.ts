import { loadPersonEventResultRankings } from "@/services/rankings/person-results";

const PREVIEW_LIMIT = 5;

export async function loadPersonProfileStatPreviews(personId: string) {
  const [single, average] = await Promise.all(
    (["single", "average"] as const).map((resultType) =>
      loadPersonEventResultRankings(
        personId,
        "333",
        new URLSearchParams({
          result: resultType,
          limit: `${PREVIEW_LIMIT}`,
        }),
      ),
    ),
  );

  return {
    data: {
      previews: [
        {
          id: "333-single",
          title: "3x3x3 Cube singles",
          resultType: "single" as const,
          eventId: "333",
          entries: single.data.entries,
          total: single.data.total,
        },
        {
          id: "333-average",
          title: "3x3x3 Cube averages",
          resultType: "average" as const,
          eventId: "333",
          entries: average.data.entries,
          total: average.data.total,
        },
      ],
    },
    diagnostics: {
      timings: {
        queueMs:
          single.diagnostics.timings.queueMs +
          average.diagnostics.timings.queueMs,
        statementMs:
          single.diagnostics.timings.statementMs +
          average.diagnostics.timings.statementMs,
      },
      queryCount:
        single.diagnostics.queryCount + average.diagnostics.queryCount,
      returnedRows:
        single.diagnostics.returnedRows + average.diagnostics.returnedRows,
      cacheOutcome:
        single.diagnostics.cacheOutcome === "hit" &&
        average.diagnostics.cacheOutcome === "hit"
          ? "hit"
          : "miss",
      cacheLayer: "memory" as const,
    },
  };
}
