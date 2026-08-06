import {
  normalizeListPublicId,
  normalizeSystemAlias,
} from "@/lib/helpers/lists/list-identifiers";
import {
  isMedalRankingType,
  type MedalRankingType,
} from "@/lib/medal-rankings";
import {
  isEventId,
  isRankingType,
  normalizeGenderFilters,
  type GenderFilter,
  type RankingType,
} from "@/lib/wca";
import {
  RANKING_LIST_DESCRIPTOR_VERSION,
  RankingListDescriptorError,
  type RankingListDescriptor,
  type RankingPopulation,
  type RankingRegion,
} from "./types";

const FIRST_WCA_YEAR = 1982;

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RankingListDescriptorError(message);
  }
  return value as Record<string, unknown>;
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) {
      throw new RankingListDescriptorError(
        `${key} is not valid for this ranking list.`,
      );
    }
  }
}

function normalizeVersion(value: unknown) {
  if (value === undefined || value === null) {
    return RANKING_LIST_DESCRIPTOR_VERSION;
  }
  if (value !== RANKING_LIST_DESCRIPTOR_VERSION) {
    throw new RankingListDescriptorError(
      `version must be ${RANKING_LIST_DESCRIPTOR_VERSION}.`,
    );
  }
  return RANKING_LIST_DESCRIPTOR_VERSION;
}

function requiredEventId(value: unknown) {
  if (typeof value !== "string" || !isEventId(value)) {
    throw new RankingListDescriptorError("eventId is invalid.");
  }
  return value;
}

function normalizeResultType(value: unknown, eventId: string): RankingType {
  const resultType = value === undefined || value === null ? "single" : value;
  if (typeof resultType !== "string" || !isRankingType(resultType)) {
    throw new RankingListDescriptorError(
      "resultType must be single or average.",
    );
  }
  if (eventId === "333mbf" && resultType === "average") {
    throw new RankingListDescriptorError(
      "Multi-Blind does not support average rankings.",
    );
  }
  return resultType;
}

function normalizeYear(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < FIRST_WCA_YEAR ||
    value > 9999
  ) {
    throw new RankingListDescriptorError(
      `year must be an integer from ${FIRST_WCA_YEAR} to 9999.`,
    );
  }
  return value;
}

function rejectUnsupportedYear(value: unknown) {
  if (normalizeYear(value) !== null) {
    throw new RankingListDescriptorError(
      "year is not supported for this ranking list.",
    );
  }
}

function normalizeRegion(value: unknown): RankingRegion {
  if (
    value === undefined ||
    value === null ||
    value === "" ||
    value === "world"
  ) {
    return { scope: "world", regionId: "" };
  }
  if (typeof value === "string") {
    const regionId = value.trim();
    if (!regionId || regionId === "world") {
      return { scope: "world", regionId: "" };
    }
    return {
      scope: regionId.startsWith("_") ? "continent" : "country",
      regionId,
    };
  }
  const input = asRecord(value, "region is invalid.");
  onlyKeys(input, ["scope", "regionId"]);
  const scope = input.scope;
  const regionId =
    typeof input.regionId === "string" ? input.regionId.trim() : "";
  if (scope === "world") return { scope: "world", regionId: "" };
  if ((scope !== "continent" && scope !== "country") || !regionId) {
    throw new RankingListDescriptorError(
      "region must contain a scope and regionId.",
    );
  }
  if (scope === "continent" && !regionId.startsWith("_")) {
    throw new RankingListDescriptorError(
      "continent regionId must start with an underscore.",
    );
  }
  if (scope === "country" && regionId.startsWith("_")) {
    throw new RankingListDescriptorError(
      "country regionId must not start with an underscore.",
    );
  }
  return { scope, regionId };
}

function normalizeGenders(value: unknown): GenderFilter[] {
  if (value === undefined || value === null || value === "") return [];
  const rawValues = Array.isArray(value) ? value : [value];
  const genders = rawValues.flatMap((item) =>
    typeof item === "string" ? item.split(",") : [item],
  );
  if (
    genders.some((gender) => gender !== "m" && gender !== "f" && gender !== "o")
  ) {
    throw new RankingListDescriptorError(
      "genders must contain only m, f, or o.",
    );
  }
  return [...normalizeGenderFilters(genders as GenderFilter[])];
}

function normalizePopulation(value: unknown): RankingPopulation {
  if (value === undefined || value === null || value === "everyone") {
    return { kind: "everyone" };
  }
  const input = asRecord(value, "population is invalid.");
  if (input.kind === "everyone") {
    onlyKeys(input, ["kind"]);
    return { kind: "everyone" };
  }
  if (input.kind === "public-list") {
    onlyKeys(input, ["kind", "publicId"]);
    const publicId =
      typeof input.publicId === "string"
        ? normalizeListPublicId(input.publicId)
        : null;
    if (!publicId) {
      throw new RankingListDescriptorError("population publicId is invalid.");
    }
    return { kind: "public-list", publicId };
  }
  if (input.kind === "system-list") {
    onlyKeys(input, ["kind", "systemAlias"]);
    const systemAlias =
      typeof input.systemAlias === "string"
        ? normalizeSystemAlias(input.systemAlias)
        : null;
    if (!systemAlias) {
      throw new RankingListDescriptorError(
        "population systemAlias is invalid.",
      );
    }
    return { kind: "system-list", systemAlias };
  }
  throw new RankingListDescriptorError(
    "population must be everyone, a public list, or a system list.",
  );
}

export function rankingPopulationFromListReference(
  value: string,
): RankingPopulation {
  const publicId = normalizeListPublicId(value);
  if (publicId) return { kind: "public-list", publicId };
  const systemAlias = normalizeSystemAlias(value);
  if (systemAlias) return { kind: "system-list", systemAlias };
  throw new RankingListDescriptorError(
    "list must be a public list ID or system-list alias.",
  );
}

function personFilters(input: Record<string, unknown>) {
  return {
    region: normalizeRegion(input.region),
    genders: normalizeGenders(input.genders),
  };
}

function listPersonFilters(input: Record<string, unknown>) {
  return {
    ...personFilters(input),
    population: normalizePopulation(input.population),
  };
}

function cityFilters(input: Record<string, unknown>) {
  const genders = normalizeGenders(input.genders);
  if (genders.length > 1) {
    throw new RankingListDescriptorError(
      "City rankings support one gender at a time.",
    );
  }
  return { region: normalizeRegion(input.region), genders };
}

function normalizeMedalType(value: unknown): MedalRankingType {
  const medalType = value === undefined || value === null ? "overall" : value;
  if (typeof medalType !== "string" || !isMedalRankingType(medalType)) {
    throw new RankingListDescriptorError(
      "medalType must be overall, gold, silver, or bronze.",
    );
  }
  return medalType;
}

export function normalizeRankingListDescriptor(
  value: unknown,
): RankingListDescriptor {
  const input = asRecord(value, "A ranking list descriptor must be an object.");
  const version = normalizeVersion(input.version);
  if (input.family === "person-event" || input.family === "person-result") {
    onlyKeys(input, [
      "version",
      "family",
      "eventId",
      "resultType",
      "year",
      "region",
      "genders",
      "population",
    ]);
    const eventId = requiredEventId(input.eventId);
    return {
      version,
      family: input.family,
      eventId,
      resultType: normalizeResultType(input.resultType, eventId),
      year: normalizeYear(input.year),
      ...listPersonFilters(input),
    } as RankingListDescriptor;
  }
  if (input.family === "person-composite") {
    if (input.metric === "sum-of-ranks") {
      onlyKeys(input, [
        "version",
        "family",
        "metric",
        "resultType",
        "year",
        "region",
        "genders",
      ]);
      return {
        version,
        family: "person-composite",
        metric: "sum-of-ranks",
        resultType: normalizeResultType(input.resultType, "SOR"),
        year: normalizeYear(input.year),
        ...personFilters(input),
      };
    }
    if (input.metric === "kinch") {
      onlyKeys(input, [
        "version",
        "family",
        "metric",
        "order",
        "year",
        "region",
        "genders",
      ]);
      rejectUnsupportedYear(input.year);
      const order =
        input.order === undefined || input.order === null
          ? "regional"
          : input.order;
      if (order !== "regional" && order !== "continent") {
        throw new RankingListDescriptorError(
          "Kinch order must be regional or continent.",
        );
      }
      const filters = personFilters(input);
      if (order === "continent" && filters.region.scope !== "country") {
        throw new RankingListDescriptorError(
          "Continent Kinch order requires a country region.",
        );
      }
      return {
        version,
        family: "person-composite",
        metric: "kinch",
        order,
        ...filters,
      };
    }
    throw new RankingListDescriptorError("person-composite metric is invalid.");
  }
  if (input.family === "person-activity") {
    if (input.metric === "competitions") {
      onlyKeys(input, [
        "version",
        "family",
        "metric",
        "year",
        "region",
        "genders",
      ]);
      return {
        version,
        family: "person-activity",
        metric: "competitions",
        year: normalizeYear(input.year),
        ...personFilters(input),
      };
    }
    if (
      input.metric === "countries" ||
      input.metric === "rounds" ||
      input.metric === "solves"
    ) {
      onlyKeys(input, [
        "version",
        "family",
        "metric",
        "year",
        "region",
        "genders",
      ]);
      rejectUnsupportedYear(input.year);
      return {
        version,
        family: "person-activity",
        metric: input.metric,
        ...personFilters(input),
      };
    }
    throw new RankingListDescriptorError("person-activity metric is invalid.");
  }
  if (input.family === "person-medals") {
    onlyKeys(input, [
      "version",
      "family",
      "medalType",
      "eventId",
      "year",
      "region",
      "genders",
    ]);
    const eventId =
      input.eventId === undefined || input.eventId === null
        ? "all"
        : input.eventId;
    if (
      typeof eventId !== "string" ||
      (eventId !== "all" && !isEventId(eventId))
    ) {
      throw new RankingListDescriptorError("eventId is invalid.");
    }
    return {
      version,
      family: "person-medals",
      medalType: normalizeMedalType(input.medalType),
      eventId,
      year: normalizeYear(input.year),
      ...personFilters(input),
    };
  }
  if (input.family === "competition") {
    if (input.metric === "fastest") {
      onlyKeys(input, [
        "version",
        "family",
        "metric",
        "eventId",
        "resultType",
        "year",
      ]);
      rejectUnsupportedYear(input.year);
      const eventId = requiredEventId(input.eventId);
      return {
        version,
        family: "competition",
        metric: "fastest",
        eventId,
        resultType: normalizeResultType(input.resultType, eventId),
      };
    }
    if (input.metric === "podium") {
      onlyKeys(input, ["version", "family", "metric", "eventId", "year"]);
      rejectUnsupportedYear(input.year);
      const eventId = requiredEventId(input.eventId);
      if (eventId === "333mbf") {
        throw new RankingListDescriptorError(
          "Multi-Blind podium rankings are not supported.",
        );
      }
      return { version, family: "competition", metric: "podium", eventId };
    }
    if (input.metric === "competitor-count") {
      onlyKeys(input, ["version", "family", "metric", "year"]);
      rejectUnsupportedYear(input.year);
      return { version, family: "competition", metric: "competitor-count" };
    }
    if (input.metric === "latitude") {
      onlyKeys(input, [
        "version",
        "family",
        "metric",
        "hemisphere",
        "region",
        "year",
      ]);
      rejectUnsupportedYear(input.year);
      const hemisphere =
        input.hemisphere === undefined || input.hemisphere === null
          ? "north"
          : input.hemisphere;
      if (hemisphere !== "north" && hemisphere !== "south") {
        throw new RankingListDescriptorError(
          "hemisphere must be north or south.",
        );
      }
      return {
        version,
        family: "competition",
        metric: "latitude",
        hemisphere,
        region: normalizeRegion(input.region),
      };
    }
    throw new RankingListDescriptorError("competition metric is invalid.");
  }
  if (input.family === "city") {
    if (input.metric === "fastest") {
      onlyKeys(input, [
        "version",
        "family",
        "metric",
        "eventId",
        "resultType",
        "year",
        "region",
        "genders",
      ]);
      rejectUnsupportedYear(input.year);
      const eventId = requiredEventId(input.eventId);
      return {
        version,
        family: "city",
        metric: "fastest",
        eventId,
        resultType: normalizeResultType(input.resultType, eventId),
        ...cityFilters(input),
      };
    }
    if (
      input.metric === "competitors" ||
      input.metric === "competitions" ||
      input.metric === "solves"
    ) {
      onlyKeys(input, [
        "version",
        "family",
        "metric",
        "eventId",
        "year",
        "region",
        "genders",
      ]);
      rejectUnsupportedYear(input.year);
      return {
        version,
        family: "city",
        metric: input.metric,
        eventId: requiredEventId(input.eventId),
        ...cityFilters(input),
      };
    }
    throw new RankingListDescriptorError("city metric is invalid.");
  }
  throw new RankingListDescriptorError("ranking list family is invalid.");
}
