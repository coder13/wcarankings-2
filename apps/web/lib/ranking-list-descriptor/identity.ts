import { createHash } from "node:crypto";
import { normalizeRankingListDescriptor } from "./normalize";
import {
  RankingListDescriptorError,
  type RankingListCacheIdentity,
  type RankingResultWindow,
} from "./types";

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RankingListDescriptorError(message);
  }
  return value as Record<string, unknown>;
}

export function normalizeRankingResultWindow(
  value: unknown,
): RankingResultWindow {
  const input = asRecord(value, "The ranking result window must be an object.");
  if (Object.keys(input).some((key) => key !== "start" && key !== "limit")) {
    throw new RankingListDescriptorError(
      "The ranking result window contains an invalid field.",
    );
  }
  if (
    typeof input.start !== "number" ||
    !Number.isInteger(input.start) ||
    input.start < 0 ||
    typeof input.limit !== "number" ||
    !Number.isInteger(input.limit) ||
    input.limit < 1
  ) {
    throw new RankingListDescriptorError(
      "The ranking result window requires a non-negative start and positive limit.",
    );
  }
  return { start: input.start, limit: input.limit };
}

export function canonicalRankingListDescriptorJson(value: unknown) {
  return JSON.stringify(normalizeRankingListDescriptor(value));
}

export function rankingListKey(value: unknown) {
  return createHash("sha256")
    .update(canonicalRankingListDescriptorJson(value))
    .digest("hex");
}

export function rankingListCacheIdentity(
  generationId: string,
  descriptor: unknown,
  window: unknown,
): RankingListCacheIdentity {
  if (!generationId.trim()) {
    throw new RankingListDescriptorError(
      "generationId is required for a cache identity.",
    );
  }
  return {
    generationId,
    listKey: rankingListKey(descriptor),
    window: normalizeRankingResultWindow(window),
  };
}

export function rankingListCacheKey(
  generationId: string,
  descriptor: unknown,
  window: unknown,
) {
  return JSON.stringify(
    rankingListCacheIdentity(generationId, descriptor, window),
  );
}
