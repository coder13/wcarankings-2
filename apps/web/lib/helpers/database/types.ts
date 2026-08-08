export type SqlTemplateTag = (
  strings: TemplateStringsArray,
  ...values: readonly unknown[]
) => string;
