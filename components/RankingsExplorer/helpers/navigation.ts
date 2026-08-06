import type { ExplorerSubject } from "../../ExplorerSubjectSwitch/ExplorerSubjectSwitch";
import { rankingStatSource } from "@/lib/ranking-stat-sources";

const countryStats = rankingStatSource("country-event-stats");

const SUBJECT_PATHS: Record<ExplorerSubject, string> = {
  people: "/",
  results: "/results",
  competitions: "/competitions/best-result",
  countries: countryStats.paths.page,
  cities: "/cities/fastest-single",
};

export function subjectPath(subject: ExplorerSubject) {
  return SUBJECT_PATHS[subject];
}
