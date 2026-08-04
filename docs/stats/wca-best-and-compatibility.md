# WCA best and compatibility lists

Status: **Active compatibility support**

## What it represents

These projections support established WCA-style result and ranking lists while
the newer result-ranking tables serve the main browse path. They include WCA
best Single and Average values, ranking-entry sources, result-entry sources,
and their count metadata.

They are compatibility support rather than a new ranking definition.

## Source data

The builds read `ranks_single` and `ranks_average` for official personal
bests, `results` and `result_attempts` for result-entry data, and competitions,
persons, countries, events, formats, and round types for display and filtering.

The active compatibility SQL is listed in
[projection-groups.mjs](../../scripts/projection-groups.mjs).

## Indexes

The source and output tables need keys for person, event, region, result value,
competition date, and stable result ID. The exact indexes are defined in
[ranking entries indexes](../../sql/ranking-projections/ranking_entries_indexes.sql)
and [result entries indexes](../../sql/ranking-projections/result_entries_single_indexes.sql).

## EXPLAIN summary

These tables use narrow canonical rank inputs where possible. Full source scans
are expected when the compatibility list is rebuilt. Display joins must happen
after a bounded page. The newer result-ranking indexes remain the preferred path
for high-volume result browsing.

## Build evidence

No isolated timing is recorded in the current projection benchmark excerpt. Add
a measured timing before changing the compatibility group or adding an index.

## Request policy

Keep this path bounded and generation-aware. Do not add new product statistics to
the compatibility group without a documented migration reason.
