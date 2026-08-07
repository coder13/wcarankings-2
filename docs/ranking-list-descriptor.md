# Ranking list descriptors

`RankingListDescriptor` identifies one semantic ranking list. The descriptor has a numeric version and a `family` discriminator.

The descriptor contains only the fields that change the list membership or rank order. It includes the event, metric, result type, year, region, and gender filters.

The supported families are `person-event`, `person-result`, `person-composite`, `person-activity`, `person-medals`, `competition`, and `city`. Each metric has only its valid fields.

Only `person-event` and `person-result` use a population. The population is `everyone`, a public list ID, or a system-list alias.

Private lists and temporary WCA-ID collections have no descriptor form. A caller must make sure that a saved list is public.

The normalizer removes equivalent forms. It sorts and de-duplicates genders, converts all three genders to no gender filter, and converts a world region to `{ scope: "world", regionId: "" }`. It also normalizes public IDs and system aliases.

The canonical JSON is `JSON.stringify(normalizeRankingListDescriptor(value))`. The list key is the SHA-256 hex digest of that JSON. The projection generation is not in the descriptor or list key.

The cache identity contains three values:

```ts
{
  generationId,
  listKey,
  window: { start, limit },
}
```

The requested result window is outside the list identity. Cursor, page, offset, limit, search text, locate-person state, profile owner, titles, slugs, cache timestamps, and generation IDs are also outside the descriptor.

`rankingListDescriptorUrl` writes canonical ranking API URLs. `parseRankingListDescriptorUrl` reads the same URLs. These helpers ignore pagination and other request state that is not list identity.
