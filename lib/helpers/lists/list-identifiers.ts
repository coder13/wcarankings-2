import { randomBytes } from "node:crypto";

const LIST_PUBLIC_ID_LENGTH = 8;
export const LIST_PUBLIC_ID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export const RESERVED_LIST_ALIASES = new Set([
  "api",
  "dynamic",
  "luke",
  "max",
  "me",
  "mine",
  "new",
  "search",
  "settings",
]);

export function generateListPublicId() {
  const bytes = randomBytes(LIST_PUBLIC_ID_LENGTH);
  let id = "";
  for (const byte of bytes) {
    id += LIST_PUBLIC_ID_ALPHABET[byte & 31];
  }
  return id;
}

export function normalizeListPublicId(value: string) {
  const normalized = value.trim().toUpperCase();
  if (normalized.length !== LIST_PUBLIC_ID_LENGTH) return null;
  if (
    ![...normalized].every((character) =>
      LIST_PUBLIC_ID_ALPHABET.includes(character),
    )
  ) {
    return null;
  }
  return normalized;
}

export function normalizeSystemAlias(value: string) {
  const normalized = value.trim().toLowerCase();
  return /^[a-z][a-z0-9-]{1,31}$/.test(normalized) ? normalized : null;
}

export function slugifyListName(value: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .replace(/-+$/g, "");
  return slug || "list";
}

export function normalizeListLookup(value: string) {
  const [publicId] = value.split("--", 1);
  return normalizeListPublicId(publicId) ?? normalizeSystemAlias(value);
}
