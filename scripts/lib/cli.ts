export function argumentValue(
  name: string,
  argv: string[] = process.argv,
): string {
  const prefix = `--${name}=`;
  return (
    argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? ""
  );
}
