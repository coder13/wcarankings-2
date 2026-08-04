# Ranking counts and list metadata

Status: **Active support projections**

## What it provides

These small tables provide page totals and list metadata for other statistics.
They do not define a new ranking. They prevent a request from counting a large
ranking table or raw fact set before returning a page.

The support tables cover result rankings by event, result type, scope, and
region; person lists by event and scope; person-competition lists by scope,
region, and gender; entity lists by ranking kind, event, and result type; and
yearly ranking by available year and cohort.

## Source data

Each build reads its matching completed ranking table. It must not read raw
`results` or `result_facts` for a normal count request.

Relevant SQL files include [result ranking counts](../../sql/ranking-projections/result_ranking_counts.sql),
[ranking counts](../../sql/ranking-projections/ranking_counts.sql),
[projection counts](../../sql/ranking-projections/projection_counts.sql), and
[entity ranking counts](../../sql/ranking-projections/entity_ranking_counts.sql).

## Indexes

Each count table needs a primary or unique key matching its full filter definition.
The source ranking must have a browse index matching the count grouping, or the
count must be produced during the same build phase as the ranking.

`result_ranking_counts` is produced from the canonical result-ranking tables.
The retired `result_counts` compatibility projection is not built or read.

## Build evidence

Measured result counts:

- `21.600 s` (`00:21.60`) for the now-retired `result_counts`;
- `39.093 s` (`00:39.09`) for `result_ranking_counts`;
- `97.258 s` (`01:37.26`) for the earlier gender count table.

The gender count table is removed with the eager gender projections. Lazy
gender result windows derive their bounded count in the generation-aware cached
request path.

## Request policy

Read counts by their exact key. Do not run `COUNT(*)` over a full ranking table
inside a page request.
