export function argumentValue(name: string, values = process.argv): string {
  const prefix = `--${name}=`;
  const argument = values.find((value) => value.startsWith(prefix));
  if (argument) return argument.slice(prefix.length);
  const separateValueIndex = values.indexOf(`--${name}`);
  return separateValueIndex === -1
    ? ""
    : (values[separateValueIndex + 1] ?? "");
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
