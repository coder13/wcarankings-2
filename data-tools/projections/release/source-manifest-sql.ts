import { SourceManifestBuilder, type SourceManifest } from "./source-manifest.ts";

type SqlValue = string | number | null;

function parseValue(input: string, start: number): { value: SqlValue; next: number } {
  let cursor = start;
  while (cursor < input.length && /\s/.test(input[cursor] ?? "")) cursor += 1;
  if (input.slice(cursor, cursor + 4).toUpperCase() === "NULL") return { value: null, next: cursor + 4 };
  if (input[cursor] === "'") {
    cursor += 1;
    let value = "";
    while (cursor < input.length) {
      const char = input[cursor++];
      if (char === "\\") { value += input[cursor++] ?? ""; continue; }
      if (char === "'") break;
      value += char;
    }
    return { value, next: cursor };
  }
  let boundary = cursor;
  while (boundary < input.length && input[boundary] !== "," && input[boundary] !== ")") boundary += 1;
  const value = input.slice(cursor, boundary).trim();
  return { value: /^-?\d+$/.test(value) ? Number(value) : value, next: boundary };
}

function parseTuple(line: string): SqlValue[] | null {
  let cursor = line.indexOf("(");
  if (cursor < 0) return null;
  const values: SqlValue[] = [];
  while (cursor < line.length) {
    const parsed = parseValue(line, values.length === 0 ? cursor + 1 : cursor);
    values.push(parsed.value);
    cursor = parsed.next;
    while (cursor < line.length && /\s/.test(line[cursor] ?? "")) cursor += 1;
    if (line[cursor] === ")") return values;
    if (line[cursor] !== ",") return null;
    cursor += 1;
  }
  return null;
}

export async function sourceManifestFromSql(
  chunks: AsyncIterable<Uint8Array | string>,
  exportId: string,
  previous?: SourceManifest,
): Promise<SourceManifest> {
  const builder = new SourceManifestBuilder(exportId);
  const decoder = new TextDecoder();
  let remainder = "";
  let table = "";
  for await (const chunk of chunks) {
    remainder += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
    const lines = remainder.split(/\r?\n/);
    remainder = lines.pop() ?? "";
    for (const line of lines) {
      const insert = line.match(/^INSERT INTO `([^`]+)` VALUES/);
      if (insert) { table = insert[1] ?? ""; continue; }
      if (!line.startsWith("(")) continue;
      const row = parseTuple(line);
      if (!row) continue;
      if (table === "competitions") {
        builder.addCompetition(String(row[0] ?? "").replace(/^'+|'+$/g, ""), Number(row[5]), row.slice(1));
      } else if (table === "results") {
        builder.addResult(String(row[1] ?? "").replace(/^'+|'+$/g, ""), Number(row[0]), row.slice(2));
      } else if (table === "result_attempts") {
        builder.addRawAttempt(Number(row[2]), Number(row[1]), row[0]);
      } else if (table === "persons") {
        builder.addPerson(`${String(row[0] ?? "")}:${String(row[1] ?? "")}`, row.slice(2));
      }
    }
  }
  return builder.build(previous);
}
