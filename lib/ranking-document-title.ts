import { WCA_EVENTS } from "@/lib/wca";

export type RankingDocumentTitleInput = {
  subject: "people" | "results" | "competitions" | "cities";
  eventId: string;
  rankingType: "single" | "average";
  competitionRanking: "best-result" | "podiums" | "competitor-count" | "latitude";
  cityRanking: "fastest-single" | "fastest-average" | "competitors" | "competitions" | "solves";
  year?: number | null;
  personCompetitionRanking?: boolean;
  listName?: string;
};

const SITE_NAME = "WCA Rankings";

function eventName(eventId: string) {
  return WCA_EVENTS.find((event) => event.id === eventId)?.name ??
    (eventId === "SOR" ? "Sum of Ranks" :
      eventId === "sor-kinch" ? "Kinch Ranks" : "3x3x3 Cube");
}

function titleWithSite(value: string) {
  return `${value} | ${SITE_NAME}`;
}

export function formatRankingDocumentTitle({
  subject,
  eventId,
  rankingType,
  competitionRanking,
  cityRanking,
  year,
  personCompetitionRanking,
  listName,
}: RankingDocumentTitleInput) {
  if (listName) return titleWithSite(listName);

  const event = eventName(eventId);
  const resultType = rankingType === "average" ? "Average" : "Single";

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

  const yearSuffix = year ? ` ${year}` : "";
  return titleWithSite(`${event} ${resultType} Rankings${yearSuffix}`);
}
