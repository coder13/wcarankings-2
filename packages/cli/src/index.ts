export function argumentValue(name: string, values = process.argv): string {
  const prefix = `--${name}=`;
  const argument = values.find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : "";
}

export function argumentList(name: string, values = process.argv): string[] {
  return argumentValue(name, values)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function argumentPresent(name: string, values = process.argv): boolean {
  return values.includes(`--${name}`);
}
