# Ranking counts and list metadata

Status: **Active support projections**

## What it provides

These small tables provide page totals and list metadata for other statistics.
They do not define a new ranking. They prevent a request from counting a large
ranking table or raw fact set before returning a page.

The support tables cover result rankings by event, result type, scope, and
region. They also cover person lists, person-competition lists, and yearly
rankings.

## Source data

Each build reads its matching completed ranking table. It must not read raw
`results` or `result_facts` for a normal count request.

Relevant SQL files include [result ranking counts](../../data-tools/projection-catalog/people/result-rankings/result_ranking_counts.sql),
and [ranking counts](../../data-tools/projection-catalog/core/ranking-tables/ranking_counts.sql).

## Indexes

Each count table needs a primary or unique key matching its full filter definition.
The source ranking must have a browse index matching the count grouping, or the
count must be produced during the same build phase as the ranking.

`result_ranking_counts` is produced from the canonical result-ranking tables.

## Build evidence

The measured `result_ranking_counts` build took `39.093 s` (`00:39.09`). Lazy
gender result windows derive their bounded count in the generation-aware cached
request path.

## Request policy

Read counts by their exact key. Do not run `COUNT(*)` over a full ranking table
inside a page request.
