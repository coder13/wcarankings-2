import type { FeedMode, RankingFeedCursor } from "./types";

const MAX_CURSOR_LENGTH = 8_192;

function asCursor(value: unknown): RankingFeedCursor {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The feed cursor is invalid.");
  }
  const cursor = value as Partial<RankingFeedCursor>;
  if (
    cursor.version !== 1 ||
    (cursor.mode !== "person" && cursor.mode !== "home") ||
    typeof cursor.generationId !== "string" ||
    typeof cursor.popularityDate !== "string" ||
    typeof cursor.seed !== "string" ||
    typeof cursor.offset !== "number" ||
    !Number.isInteger(cursor.offset) ||
    cursor.offset < 0 ||
    !Array.isArray(cursor.listKeys) ||
    !Array.isArray(cursor.diversityKeys) ||
    !Array.isArray(cursor.anchors) ||
    cursor.listKeys.some((item) => typeof item !== "string") ||
    cursor.diversityKeys.some((item) => typeof item !== "string") ||
    cursor.anchors.some((item) => typeof item !== "string")
  ) {
    throw new Error("The feed cursor is invalid.");
  }
  return cursor as RankingFeedCursor;
}

export function encodeRankingFeedCursor(cursor: RankingFeedCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeRankingFeedCursor(value: string, mode: FeedMode) {
  if (!value || value.length > MAX_CURSOR_LENGTH) {
    throw new Error("The feed cursor is invalid.");
  }
  try {
    const cursor = asCursor(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
    if (cursor.mode !== mode) throw new Error("The feed cursor is invalid.");
    return cursor;
  } catch {
    throw new Error("The feed cursor is invalid.");
  }
}
