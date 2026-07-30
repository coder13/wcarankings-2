export function parseListMemberIds(value: string) {
  return value
    .split(/[\s,;|]+/)
    .map((personId) => personId.trim().toUpperCase())
    .filter(Boolean);
}
