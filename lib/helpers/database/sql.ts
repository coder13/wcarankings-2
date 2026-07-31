import type { SqlTemplateTag } from "@/lib/helpers/database/types";

export const sql: SqlTemplateTag = (strings, ...values) =>
  strings.reduce(
    (query, part, index) => `${query}${part}${values[index] ?? ""}`,
    "",
  );
