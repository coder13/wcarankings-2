export function listPath(input: { publicId: string | null; systemAlias: string | null; slug: string }) {
  if (input.systemAlias) return `/lists/${input.systemAlias}`;
  return input.publicId ? `/lists/${input.publicId}--${input.slug}` : "/lists";
}
