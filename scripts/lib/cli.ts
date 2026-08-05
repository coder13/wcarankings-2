export function argumentValue(
  name: string,
  argv: string[] = process.argv,
): string {
  const prefix = `--${name}=`;
  return (
    argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? ""
  );
}

export function hasArgument(
  name: string,
  argv: string[] = process.argv,
): boolean {
  return argv.includes(`--${name}`);
}

export function listArgument(
  name: string,
  argv: string[] = process.argv,
): string[] {
  return argumentValue(name, argv)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}
