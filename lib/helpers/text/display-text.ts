export function stripMarkdownLinks(value: string) {
  return value.replace(
    /\[([^\]]+)\]\((?:[^()]|\([^)]*\))*\)/g,
    "$1",
  );
}
