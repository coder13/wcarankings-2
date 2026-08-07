import { parseListMemberIds } from "@/lib/helpers/lists/list-member-ids";
import type { ListPerson } from "./shared";

export type ListAddSubmission =
  | { type: "commit-buffer" }
  | { type: "commit-person-ids"; personIds: string[] }
  | { type: "select-person"; person: ListPerson }
  | { type: "none" };

export function highlightedPersonForBuffer(
  entries: ListPerson[],
  activeIndex: number,
) {
  return entries[activeIndex] ?? null;
}

export function resolveListAddSubmission(
  value: string,
  entries: ListPerson[],
  activeIndex: number,
): ListAddSubmission {
  if (!value.trim()) return { type: "commit-buffer" };

  const personIds = parseListMemberIds(value);
  if (personIds.length > 1 || /^\d{4}[A-Za-z0-9]{4}\d{2}$/.test(value.trim())) {
    return { type: "commit-person-ids", personIds };
  }

  const person = highlightedPersonForBuffer(entries, activeIndex);
  return person ? { type: "select-person", person } : { type: "none" };
}
