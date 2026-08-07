export type ListPathInput = {
  publicId: string | null;
  systemAlias: string | null;
  slug: string;
};

export function listPath(input: ListPathInput) {
  if (input.systemAlias) return `/lists/${input.systemAlias}`;
  return input.publicId ? `/lists/${input.publicId}--${input.slug}` : "/lists";
}
