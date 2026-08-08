# Single result rankings

Status: **Active**

## What it ranks

This statistic ranks every valid Single solve by event and by geographic scope:
World, continent, and country. `RANK()` gives the public rank. A deterministic
position orders ties by solve value, competition date, competition ID, result ID,
and attempt number.

A list row represents an official result and attempt number. The public API uses
position for page boundaries. It never exposes the internal position field as
user-facing copy.

## Source data

The current build uses the temporary `solve_facts_stage`, assembled from
`result_facts` and `result_attempts`. Person, gender, region, and competition
fields are copied from `result_facts`; the stage does not join `persons` or
`competitions`. It is dropped after the result-ranking and personal-ranking
steps finish. `solve_facts` is no longer a persistent published table.

The ranking table is
[result_rankings_single.sql](../../data-tools/projection-catalog/people/result-rankings/result_rankings_single.sql).

## Indexes

The published table needs:

- primary key `(result_id, attempt_number)`;
- `(event_id, world_position)`;
- `(event_id, continent_id, continent_position)`;
- `(event_id, country_id, country_position)`;
- `(person_id, event_id, world_position, result_id, attempt_number)`;
- the measured lazy gender fallback index on gender, event, region, value, date,
  competition, result, and attempt.

The build creates all persistent indexes in one `ALTER TABLE` so MariaDB does
not rebuild the 29-million-row table once per index.

## EXPLAIN summary

Window functions must sort complete event partitions during a full rebuild.
Those sorts are inherent in producing all three geographic ranks. The key plan
finding was join order in the temporary solve stage:

- persons-first plan on the bounded test: `16.07 s`;
- facts-first plan on the same test: `1.08 s`;
- measured improvement: about `14.9x`.

The facts-first `STRAIGHT_JOIN` stage avoids the optimizer's slower
person-driven access path and removes the repeated person join. Request queries
must use the position indexes and page before joining display names.

## Build evidence

Earlier full export:

- result table: `1,343.878 s` (`22:23.88`);
- output: `29,638,598` rows.

The new temporary solve stage completed in `130.44 s` (`02:10.44`) in the
local profile. The complete post-change result-ranking build remains pending
until the current branch finishes focused validation.

## Live overlay policy

Live polling does not rewrite this materialized table. Active provisional
competition snapshots are a small read-time overlay. The request reads a
bounded base window, merges the relevant live attempts, and returns the final
page order.

A public rank is `1 + the number of better results`. For an official base row,
the stored rank is adjusted by the count of live attempts with a lower value.
The code never adds two rank numbers. A live row uses the first official base
row at or after its value as an anchor, then applies the same small adjustment.

The overlay contains only active, un-reconciled competition snapshots. The
official incremental worker in issue 247 must remove a snapshot only after it
has replaced the authoritative competition data and compacted the affected
ranking partition.

## Retired provisional rebuild policy

One changed live event creates one Single rebuild for each supported period.
Each rebuild calculates World, continent, country, and gender rank columns in
one query. It replaces the former separate scope and gender jobs.

The live poller compares the changed attempt array with the stored array. A
name or placing change does not create this rebuild. An invalid attempt also
does not create it. The worker repeats the valid-attempt check before it starts
the rebuild.

On 2026-08-08, the Bespin read-only benchmark processed the all-time 6x6
Single candidate and window stage in `15.864 s`. This measurement excludes the
upsert and serving-index updates.

The same database has 1,358,662 all-time 5x5 Single rows. Its fastest live 5x5
value was `4258`, which moves 1,354,164 rows. A read-only suffix count took
`20.594 s`. An exact stored update must also update rank and position indexes.
The current direct rebuild is not a seconds-scale operation for this case.

## Request policy

World, continent, and country pages use stored positions. A request must select
a bounded window, then join person and competition display data. A 400-row
server-side window is the default cache unit for adjacent page requests.
