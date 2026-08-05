import { WCA_EVENTS } from "@/lib/wca";
import type { MedalRankingType } from "@/lib/medal-rankings";

export type RankingDocumentTitleInput = {
  subject: "people" | "results" | "competitions" | "cities";
  eventId: string;
  rankingType: "single" | "average";
  competitionRanking:
    "best-result" | "podiums" | "competitor-count" | "latitude";
  cityRanking:
    | "fastest-single"
    | "fastest-average"
    | "competitors"
    | "competitions"
    | "solves";
  year?: number | null;
  personCompetitionRanking?: boolean;
  personMedalRanking?: boolean;
  medalType?: MedalRankingType;
  listName?: string;
};

const SITE_NAME = "WCA Rankings";

function eventName(eventId: string) {
  const name = WCA_EVENTS.find((event) => event.id === eventId)?.name;
  if (name) return name;
  if (eventId === "SOR") return "Sum of Ranks";
  if (eventId === "sor-kinch") return "Kinch Ranks";
  return "3x3x3 Cube";
}

function titleWithSite(value: string) {
  return `${value} | ${SITE_NAME}`;
}

function normalizedRankingType({
  subject,
  eventId,
  rankingType,
  competitionRanking,
  cityRanking,
}: Pick<
  RankingDocumentTitleInput,
  "subject" | "eventId" | "rankingType" | "competitionRanking" | "cityRanking"
>) {
  if (eventId === "333mbf" || eventId === "sor-kinch") return "single";
  if (subject === "cities" && cityRanking === "fastest-single") return "single";
  if (subject === "cities" && cityRanking === "fastest-average")
    return "average";
  if (subject === "competitions" && competitionRanking === "podiums") {
    if (["333bf", "444bf", "555bf"].includes(eventId)) return "single";
    return "average";
  }
  return rankingType;
}

export function formatRankingDocumentTitle({
  subject,
  eventId,
  rankingType,
  competitionRanking,
  cityRanking,
  year,
  personCompetitionRanking,
  personMedalRanking,
  medalType = "overall",
  listName,
}: RankingDocumentTitleInput) {
  if (listName) return titleWithSite(listName);

  const event = eventName(eventId);
  const resultType =
    normalizedRankingType({
      subject,
      eventId,
      rankingType,
      competitionRanking,
      cityRanking,
    }) === "average"
      ? "Average"
      : "Single";

  if (subject === "results") {
    return titleWithSite(`${event} ${resultType} Results`);
  }

  if (subject === "competitions") {
    if (competitionRanking === "best-result") {
      return titleWithSite("Competition Best Results");
    }
    if (competitionRanking === "competitor-count") {
      return titleWithSite("Competition Competitor Counts");
    }
    if (competitionRanking === "latitude") {
      return titleWithSite("Northernmost and Southernmost Competitions");
    }
    return titleWithSite(`${event} ${resultType} Competition Podiums`);
  }

  if (subject === "cities") {
    const cityTitles = {
      "fastest-single": `${event} Fastest Single Cities`,
      "fastest-average": `${event} Fastest Average Cities`,
      competitors: "Cities by Competitor Count",
      competitions: "Cities by Competition Count",
      solves: "Cities by Official Solve Count",
    };
    return titleWithSite(cityTitles[cityRanking]);
  }

  if (personCompetitionRanking) {
    return titleWithSite("People by Competition Count");
  }

  if (personMedalRanking) {
    const eventPrefix = eventId === "all" ? "" : `${event} `;
    const medalPrefix =
      medalType === "overall"
        ? ""
        : `${medalType[0].toUpperCase()}${medalType.slice(1)} `;
    return titleWithSite(`${eventPrefix}${medalPrefix}Medal Rankings`);
  }

  const yearSuffix = year ? ` ${year}` : "";
  return titleWithSite(`${event} ${resultType} Rankings${yearSuffix}`);
}
