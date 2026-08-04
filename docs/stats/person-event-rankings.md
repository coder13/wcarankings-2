# Person-event rankings

Status: **Active**

## What it ranks

This statistic ranks the best Single or Average for each person and event. It
stores World, continent, and country rank and position.

A list row represents a person, event, and result type. The source WCA rank tables
provide the best value. The build resolves the earliest result with that value,
then applies stable rank and position rules.

## Source data

The build reads `ranks_single` and `ranks_average` for official best values and
`result_facts` for the retained result, historical region, and normalized
gender.

The SQL is in
[person_event_rankings.sql](../../sql/ranking-projections/person_event_rankings.sql).

## Indexes

The published table needs:

- primary key `(person_id, event_id, result_type)`;
- World, continent, and country page indexes by position;
- value indexes for lazy metric and filtered ranking work;
- gender, continent-gender, and country-gender value indexes.

The build creates browse and lazy-filter indexes in one `ALTER TABLE`.

## EXPLAIN summary

The build first reads one best value per person and event from canonical rank
tables. It then joins `result_facts` on person, event, and value. This avoids
ranking every historical result twice just to discard all but the best row. The
remaining window sorts cover required event and region partitions and are
expected during a full rebuild.

## Build evidence

Earlier full export:

- table build: `1,682.447 s` (`28:04.47`);
- output: `1,920,652` rows.

This is one of the largest active person-ranking build costs. Any change must
compare candidate rows before the window functions.

## Request policy

Use position indexes for pages. Resolve a person search before reading the
ranking table. Join names, countries, and result display fields only after the
page is bounded.
