import type {
  ExplorerSubject,
  NavigationSubject,
} from "../../ExplorerSubjectSwitch/ExplorerSubjectSwitch";

const SUBJECT_PATHS: Record<ExplorerSubject, string> = {
  people: "/persons/rankings",
  results: "/persons/results",
  competitions: "/competitions/best-result",
  cities: "/cities/fastest-single",
};

export function subjectPath(subject: ExplorerSubject) {
  return SUBJECT_PATHS[subject];
}

const NAVIGATION_PATHS: Record<NavigationSubject, string> = {
  feed: "/",
  ...SUBJECT_PATHS,
  lists: "/lists",
};

export function navigationPath(subject: NavigationSubject) {
  return NAVIGATION_PATHS[subject];
}
