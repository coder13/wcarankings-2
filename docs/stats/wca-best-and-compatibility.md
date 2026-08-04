# WCA best and compatibility lists

Status: **Active compatibility support**

## What it represents

These projections support established WCA-style person ranking lists while the
newer result-ranking tables serve result browsing. They include WCA best Single
and Average values, ranking-entry sources, and person-ranking count metadata.

They are compatibility support rather than a new ranking definition.

## Source data

The builds read `ranks_single` and `ranks_average` for official personal bests,
plus the dimensions needed for display and filtering.

The active compatibility SQL is listed in
[projection-groups.mjs](../../scripts/projection-groups.mjs).

## Indexes

The source and output tables need keys for person, event, region, and result
value. The exact output indexes are defined in
[ranking entries indexes](../../sql/ranking-projections/ranking_entries_indexes.sql).

## EXPLAIN summary

These tables use narrow canonical rank inputs where possible. Full source scans
are expected when a compatibility list is rebuilt. Display joins must happen
after a bounded page. `result_rankings_single` and `result_rankings_average` are
the only result browse projections; the unused `result_entries_single` and
`result_counts` compatibility tables are retired.

## Build evidence

No isolated timing is recorded in the current projection benchmark excerpt. Add
a measured timing before changing the compatibility group or adding an index.

## Request policy

Keep this path bounded and generation-aware. Do not add new product statistics to
the compatibility group without a documented migration reason.
