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
[result_rankings_single.sql](../../sql/ranking-projections/result_rankings_single.sql).

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

## Request policy

World, continent, and country pages use stored positions. A request must select
a bounded window, then join person and competition display data. A 400-row
server-side window is the default cache unit for adjacent page requests.
