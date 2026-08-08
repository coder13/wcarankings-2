import { ApiInputError } from "@/lib/api/projection";

export function withFixedQueryParams(
  params: URLSearchParams,
  fixed: Record<string, string>,
) {
  const normalized = new URLSearchParams(params);
  for (const [name, value] of Object.entries(fixed)) {
    if (params.has(name)) {
      throw new ApiInputError(`${name} is selected by this API route.`);
    }
    normalized.set(name, value);
  }
  return normalized;
}
