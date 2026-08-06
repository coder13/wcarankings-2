# Ranking tables

Status: **Active**

## Purpose

The `ranking-tables` group builds the current WCA-style person ranking lists.
It publishes Single and Average ranking entries with their page counts.

## Source data

The build reads official best values from `ranks_single` and `ranks_average`.
It joins `result_facts` when it builds the ranking-entry sources.

The job definition is in
[`definition.ts`](../../data-tools/projection-catalog/core/ranking-tables/definition.ts).
The SQL files are in the same catalog directory.

## Published tables

- `ranking_entries_single`
- `ranking_entries_average`
- `ranking_counts`

## Request policy

Read each page from its matching ranking-entry table. Read each total from
`ranking_counts`. Apply display joins after the query selects a bounded page.
