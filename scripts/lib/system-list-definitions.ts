export const SYSTEM_LIST_DEFINITIONS = [
  {
    key: "given-name-max",
    alias: "max",
    version: 2,
    name: "Max",
    description: null,
    token: "max",
  },
  {
    key: "given-name-luke",
    alias: "luke",
    version: 2,
    name: "Luke",
    description: null,
    token: "luke",
  },
];

export function primaryNameToken(name: unknown) {
  return String(name ?? "")
    .normalize("NFKC")
    .split("(", 1)[0]
    .trim()
    .split(/\s+/, 1)[0]
    .toLocaleLowerCase("en-US");
}
