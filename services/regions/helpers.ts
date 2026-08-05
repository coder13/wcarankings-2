import type { WcaCountry } from "@/lib/data/types";

let countriesRequest: Promise<WcaCountry[]> | null = null;

function isWcaCountry(value: unknown): value is WcaCountry {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "name" in value &&
    typeof value.name === "string"
  );
}

export function getWcaCountries() {
  if (!countriesRequest) {
    countriesRequest = fetch(
      "https://www.worldcubeassociation.org/api/v0/countries",
      {
        signal: AbortSignal.timeout(5000),
      },
    )
      .then(async (response) => {
        if (!response.ok) return [];
        const data = (await response.json()) as unknown;
        return Array.isArray(data) ? data.filter(isWcaCountry) : [];
      })
      .catch(() => []);
  }
  return countriesRequest;
}
