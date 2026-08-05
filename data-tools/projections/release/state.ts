export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stringProperty(
  value: unknown,
  property: string,
): string | undefined {
  if (!isRecord(value)) return undefined;
  const result = value[property];
  return typeof result === "string" ? result : undefined;
}

export function nestedProperty(value: unknown, property: string): unknown {
  return isRecord(value) ? value[property] : undefined;
}

export function activeFingerprint(
  state: unknown,
  mapName: string,
  groupName: string,
  groupProperty: string,
): string | null {
  const direct = stringProperty(nestedProperty(state, mapName), groupName);
  if (direct) return direct;
  const group = nestedProperty(nestedProperty(state, "groups"), groupName);
  return stringProperty(group, groupProperty) ?? null;
}
