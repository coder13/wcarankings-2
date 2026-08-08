import { query as defaultQuery } from "@/db";
import type { AuthUser } from "@/services/auth/types";
import type { RegionRecord } from "@/services/regions/types";
import { FEED_SORT_CONSTANTS } from "./constants";

type FeedQuery = (
  text: string,
  values?: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>;

export type FeedUserPreferences = {
  countryId: string;
  continentId: string;
  preferredCountryIds: string[];
  preferredContinentIds: string[];
};

export async function loadFeedUserPreferences(
  user: AuthUser | null,
  countries: readonly RegionRecord[],
  query: FeedQuery = defaultQuery,
): Promise<FeedUserPreferences | null> {
  if (!user) return null;
  const country = countries.find(
    (candidate) =>
      candidate.iso2?.toUpperCase() === user.countryIso2.toUpperCase(),
  );
  const result = await query(
    `SELECT competition.country_id, country.continent_id,
       COUNT(DISTINCT competition.id) AS competition_count
     FROM results result
     INNER JOIN competitions competition ON competition.id = result.competition_id
     LEFT JOIN countries country ON country.id = competition.country_id
     WHERE result.person_id = ?
     GROUP BY competition.country_id, country.continent_id
     ORDER BY competition_count DESC, competition.country_id
     LIMIT ?`,
    [user.wcaId, FEED_SORT_CONSTANTS.maxPreferredCountries],
  );
  const preferredCountryIds = result.rows
    .map((row) => String(row.country_id ?? ""))
    .filter(Boolean);
  const preferredContinentIds = [
    ...new Set(
      result.rows.map((row) => String(row.continent_id ?? "")).filter(Boolean),
    ),
  ];
  return {
    countryId: country?.id ?? "",
    continentId: country
      ? String(
          result.rows.find((row) => row.country_id === country.id)
            ?.continent_id ?? "",
        )
      : "",
    preferredCountryIds,
    preferredContinentIds,
  };
}
