import type { GenderFilter, RankingType } from "@/lib/wca";
import {
  normalizeRankingListDescriptor,
  rankingPopulationFromListReference,
} from "./normalize";
import {
  RANKING_LIST_DESCRIPTOR_VERSION,
  RankingListDescriptorError,
  type RankingPopulation,
  type RankingRegion,
} from "./types";

function addRegion(params: URLSearchParams, region: RankingRegion) {
  if (region.scope !== "world") params.set("region", region.regionId);
}

function addGenders(params: URLSearchParams, genders: readonly GenderFilter[]) {
  if (genders.length) params.set("gender", genders.join(","));
}

function addPopulation(params: URLSearchParams, population: RankingPopulation) {
  if (population.kind === "public-list") {
    params.set("list", population.publicId);
  }
  if (population.kind === "system-list") {
    params.set("list", population.systemAlias);
  }
}

function addPersonFilters(
  params: URLSearchParams,
  descriptor: {
    region: RankingRegion;
    genders: readonly GenderFilter[];
  },
) {
  addRegion(params, descriptor.region);
  addGenders(params, descriptor.genders);
}

function addListPersonFilters(
  params: URLSearchParams,
  descriptor: {
    region: RankingRegion;
    genders: readonly GenderFilter[];
    population: RankingPopulation;
  },
) {
  addPersonFilters(params, descriptor);
  addPopulation(params, descriptor.population);
}

function addCityFilters(
  params: URLSearchParams,
  descriptor: { region: RankingRegion; genders: readonly GenderFilter[] },
) {
  addRegion(params, descriptor.region);
  addGenders(params, descriptor.genders);
}

function pathWithParams(pathname: string, params: URLSearchParams) {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function rankingListDescriptorUrl(value: unknown) {
  const descriptor = normalizeRankingListDescriptor(value);
  const params = new URLSearchParams();
  if (descriptor.family === "person-event") {
    params.set("eventId", descriptor.eventId);
    params.set("result", descriptor.resultType);
    if (descriptor.year !== null) params.set("year", String(descriptor.year));
    addListPersonFilters(params, descriptor);
    return pathWithParams("/api/rankings", params);
  }
  if (descriptor.family === "person-result") {
    params.set("eventId", descriptor.eventId);
    params.set("result", descriptor.resultType);
    if (descriptor.year !== null) params.set("year", String(descriptor.year));
    addListPersonFilters(params, descriptor);
    return pathWithParams("/api/rankings/results", params);
  }
  if (descriptor.family === "person-composite") {
    params.set(
      "eventId",
      descriptor.metric === "sum-of-ranks" ? "SOR" : "sor-kinch",
    );
    if (descriptor.metric === "sum-of-ranks") {
      params.set("result", descriptor.resultType);
      if (descriptor.year !== null) params.set("year", String(descriptor.year));
    } else if (descriptor.order === "continent") {
      params.set("kinch", "continent");
    }
    addPersonFilters(params, descriptor);
    return pathWithParams("/api/rankings", params);
  }
  if (descriptor.family === "person-activity") {
    params.set("metric", descriptor.metric);
    if (descriptor.metric === "competitions" && descriptor.year !== null) {
      params.set("year", String(descriptor.year));
    }
    addPersonFilters(params, descriptor);
    return pathWithParams("/api/rankings/people/activity", params);
  }
  if (descriptor.family === "person-medals") {
    if (descriptor.eventId !== "all") params.set("eventId", descriptor.eventId);
    if (descriptor.medalType !== "overall") {
      params.set("medal", descriptor.medalType);
    }
    if (descriptor.year !== null) params.set("year", String(descriptor.year));
    addPersonFilters(params, descriptor);
    return pathWithParams("/api/rankings/people/medals", params);
  }
  if (descriptor.family === "competition") {
    if (descriptor.metric === "fastest") {
      params.set("eventId", descriptor.eventId);
      params.set("result", descriptor.resultType);
    } else if (descriptor.metric === "podium") {
      params.set("ranking", "podium");
      params.set("eventId", descriptor.eventId);
    } else if (descriptor.metric === "competitor-count") {
      params.set("ranking", "competitor-count");
    } else {
      params.set("ranking", "latitude");
      if (descriptor.hemisphere === "south") params.set("hemisphere", "south");
      addRegion(params, descriptor.region);
    }
    return pathWithParams("/api/rankings/competitions", params);
  }
  params.set("eventId", descriptor.eventId);
  if (descriptor.metric === "fastest") {
    params.set("result", descriptor.resultType);
  } else {
    params.set("stat", descriptor.metric);
  }
  addCityFilters(params, descriptor);
  return pathWithParams("/api/rankings/cities", params);
}

function parseUrl(value: string | URL) {
  return new URL(value.toString(), "https://wca-rankings.invalid");
}

function yearFromUrl(params: URLSearchParams) {
  const year = params.get("year");
  return year === null ? null : Number(year);
}

function personUrlFields(params: URLSearchParams) {
  if (params.has("list")) {
    throw new RankingListDescriptorError(
      "list is not supported for this ranking list.",
    );
  }
  return {
    region: params.get("region"),
    genders: params.getAll("gender"),
  };
}

function rejectListParam(params: URLSearchParams) {
  if (params.has("list")) {
    throw new RankingListDescriptorError(
      "list is not supported for this ranking list.",
    );
  }
}

function listPersonUrlFields(params: URLSearchParams) {
  const list = params.get("list");
  return {
    region: params.get("region"),
    genders: params.getAll("gender"),
    population: list
      ? rankingPopulationFromListReference(list)
      : { kind: "everyone" },
  };
}

function podiumResultType(eventId: string): RankingType {
  return ["333bf", "444bf", "555bf"].includes(eventId) ? "single" : "average";
}

export function parseRankingListDescriptorUrl(value: string | URL) {
  const url = parseUrl(value);
  const params = url.searchParams;
  if (url.pathname === "/api/rankings") {
    const eventId = params.get("eventId") ?? "333";
    if (eventId === "SOR") {
      return normalizeRankingListDescriptor({
        version: RANKING_LIST_DESCRIPTOR_VERSION,
        family: "person-composite",
        metric: "sum-of-ranks",
        resultType: params.get("result"),
        year: yearFromUrl(params),
        ...personUrlFields(params),
      });
    }
    if (eventId === "sor-kinch") {
      return normalizeRankingListDescriptor({
        version: RANKING_LIST_DESCRIPTOR_VERSION,
        family: "person-composite",
        metric: "kinch",
        order: params.get("kinch") === "continent" ? "continent" : "regional",
        year: yearFromUrl(params),
        ...personUrlFields(params),
      });
    }
    return normalizeRankingListDescriptor({
      version: RANKING_LIST_DESCRIPTOR_VERSION,
      family: "person-event",
      eventId,
      resultType: params.get("result"),
      year: yearFromUrl(params),
      ...listPersonUrlFields(params),
    });
  }
  if (url.pathname === "/api/rankings/results") {
    return normalizeRankingListDescriptor({
      version: RANKING_LIST_DESCRIPTOR_VERSION,
      family: "person-result",
      eventId: params.get("eventId") ?? "333",
      resultType: params.get("result"),
      year: yearFromUrl(params),
      ...listPersonUrlFields(params),
    });
  }
  if (
    url.pathname === "/api/rankings/people/activity" ||
    url.pathname === "/api/rankings/people/competitions"
  ) {
    const metric = url.pathname.endsWith("/competitions")
      ? "competitions"
      : (params.get("metric") ?? "competitions");
    return normalizeRankingListDescriptor({
      version: RANKING_LIST_DESCRIPTOR_VERSION,
      family: "person-activity",
      metric,
      year: yearFromUrl(params),
      ...personUrlFields(params),
    });
  }
  if (url.pathname === "/api/rankings/people/medals") {
    return normalizeRankingListDescriptor({
      version: RANKING_LIST_DESCRIPTOR_VERSION,
      family: "person-medals",
      medalType: params.get("medal"),
      eventId: params.get("eventId") ?? "all",
      year: yearFromUrl(params),
      ...personUrlFields(params),
    });
  }
  if (url.pathname === "/api/rankings/competitions") {
    rejectListParam(params);
    const metric = params.get("ranking") ?? "fastest";
    if (metric === "fastest") {
      return normalizeRankingListDescriptor({
        version: RANKING_LIST_DESCRIPTOR_VERSION,
        family: "competition",
        metric,
        eventId: params.get("eventId"),
        resultType: params.get("result"),
        year: yearFromUrl(params),
      });
    }
    if (metric === "podium") {
      const descriptor = normalizeRankingListDescriptor({
        version: RANKING_LIST_DESCRIPTOR_VERSION,
        family: "competition",
        metric,
        eventId: params.get("eventId"),
        year: yearFromUrl(params),
      });
      if (
        descriptor.family !== "competition" ||
        descriptor.metric !== "podium"
      ) {
        throw new RankingListDescriptorError("competition metric is invalid.");
      }
      const result = params.get("result");
      if (result && result !== podiumResultType(descriptor.eventId)) {
        throw new RankingListDescriptorError(
          "result is invalid for this podium ranking.",
        );
      }
      return descriptor;
    }
    if (metric === "competitor-count") {
      return normalizeRankingListDescriptor({
        version: RANKING_LIST_DESCRIPTOR_VERSION,
        family: "competition",
        metric,
        year: yearFromUrl(params),
      });
    }
    if (metric === "latitude") {
      return normalizeRankingListDescriptor({
        version: RANKING_LIST_DESCRIPTOR_VERSION,
        family: "competition",
        metric,
        hemisphere: params.get("hemisphere"),
        region: params.get("region"),
        year: yearFromUrl(params),
      });
    }
    throw new RankingListDescriptorError("competition metric is invalid.");
  }
  if (url.pathname === "/api/rankings/cities") {
    rejectListParam(params);
    const metric = params.get("stat") ?? "fastest";
    return normalizeRankingListDescriptor({
      version: RANKING_LIST_DESCRIPTOR_VERSION,
      family: "city",
      metric,
      eventId: params.get("eventId"),
      ...(metric === "fastest" ? { resultType: params.get("result") } : {}),
      year: yearFromUrl(params),
      region: params.get("region"),
      genders: params.getAll("gender"),
    });
  }
  throw new RankingListDescriptorError(
    "The URL does not identify a ranking list.",
  );
}
