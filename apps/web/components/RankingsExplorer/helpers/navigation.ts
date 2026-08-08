import type { ExplorerSubject } from "../../ExplorerSubjectSwitch/ExplorerSubjectSwitch";

const SUBJECT_PATHS: Record<ExplorerSubject, string> = {
  people: "/persons/rankings",
  results: "/persons/results",
  competitions: "/competitions/best-result",
  cities: "/cities/fastest-single",
};

export function subjectPath(subject: ExplorerSubject) {
  return SUBJECT_PATHS[subject];
}
