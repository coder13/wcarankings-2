import { ApiInputError } from "./projection";

export function withFixedQueryParams(
  params: URLSearchParams,
  fixed: Record<string, string>,
  forbidden: readonly string[] = [],
) {
  for (const name of forbidden) {
    if (params.has(name)) {
      throw new ApiInputError(`${name} is set by this endpoint.`);
    }
  }
  const next = new URLSearchParams(params);
  for (const [name, value] of Object.entries(fixed)) {
    const requested = next.get(name);
    if (requested !== null && requested !== value) {
      throw new ApiInputError(`${name} is set by this endpoint.`);
    }
    next.set(name, value);
  }
  return next;
}
