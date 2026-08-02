export const EMPTY_OWNER_LIST_MESSAGE = "Add cubers to this list to get started.";

export function emptyOwnerListMessage(owner?: { memberCount: number }) {
  return owner?.memberCount === 0 ? EMPTY_OWNER_LIST_MESSAGE : undefined;
}
