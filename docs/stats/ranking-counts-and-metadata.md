# Ranking counts and list metadata

Status: **Active support projections**

## What it provides

The API provides page totals and list metadata for other statistics. These
values do not define a new ranking. The API caches totals by generation and
filter.

The API counts completed serving tables by event, result type, scope, and
region. It counts person, competition, medal, and yearly ranking tables with
the same filter used by each request.

## Source data

Each build reads its matching completed ranking table. It must not read raw
`results` or `result_facts` for a normal count request.

The projection catalog does not build metadata-only count tables.

## Indexes

Each serving table needs an index that supports its page query and its count
filter. The API must use the same generation-aware cache for rows and totals.

## Build evidence

The benchmark must record count query time with the serving-table build time.
The shared-grain benchmark compares this cost with the removed count-table
builds.

## Request policy

Read totals from the generation-aware cache. Use a filtered `COUNT(*)` query
when the cache does not contain the requested generation and filter.
