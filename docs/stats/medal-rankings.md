# Medal rankings

Status: **Active**

## What it ranks

Medal rankings have four separate statistics: Overall medals, Gold medals,
Silver medals, and Bronze medals. Overall is the sum of the three medal types.

One row represents one person, one event selection, one statistic, and one
historical region cohort. The event selection is all events or one WCA event.

Each statistic uses its own `RANK()` calculation. Equal counts have the same
public rank. The stable page position orders equal counts by `person_id`.

The list includes only people with a positive count for the selected medal
type. This rule prevents a large zero-count tie.

## Source data

`result_facts` is the source table. A row counts as a medal when it is an
official final-round result in positions one through three. The result must
also have a positive Single or Average value.

`person_country_id` and `person_continent_id` define the historical region.
A person contributes each medal to the region that they represented then.

`person_medal_scores` stores scores by year, event, person, historical country,
historical continent, and gender. The gender value comes from `result_facts`.

## Build and table design

The build has three tables:

- `person_medal_scores` is the compact score source for all later queries.
- `person_medal_rankings` stores all-time World, continent, and country rows.
- The API counts matching all-time rows from `person_medal_rankings`.

The all-time table stores all events as `event_id = ''`. It also stores each
individual event. It stores one row for each medal statistic.

The page index is
`(event_id, medal_type, scope, region_id, position, person_id)`. It serves the
all-time page lookup. The score table has indexes for continent and gender
filters. The gender index starts with `person_gender`.

## Query plans

Measured on 2026-08-05 with the imported Bespin WCA export and MariaDB 11.8.

The score build scans `result_facts` once. `EXPLAIN FORMAT=JSON` estimated
6,653,664 rows. It uses a temporary table and a filesort for the score group.
This scan occurs once during the projection build, not during a page request.

The all-time page query uses `idx_person_medal_rankings_page`. It applies the
event, statistic, scope, region, and position filters before person joins.
The measured plan reads a 400-row page range. It does not sort that page.

The lazy women query uses `idx_person_medal_scores_gender` with `ref` access.
The plan estimates 13,108 score rows. It uses a temporary table and a filesort
to group people and calculate the window rank.

The lazy path has a separate count query. It reads the same compact score
table. This query keeps the correct total when a deep page has no rows.

## Computation and cache policy

All-time queries without a gender filter read the eager ranking and count
tables. Year and gender filters rank rows from the compact score table.

The lazy path reads a 400-row window. Its cache key includes the data version,
event, statistic, scope, region, gender, year, and window start. Equal
in-flight requests share one database load.

The combination space for year, event, region, gender, and medal type is large.
Precomputing every combination would create many unused ranking rows. The
measured lazy path meets the request target.

## Measurements

The targeted projection build completed in `33.682 s`:

- scores: `9.376 s`, `175,155` rows;
- all-time rankings: `23.142 s`, `778,751` rows;
- counts: `0.886 s`, `8,448` rows.

The build is below the two-minute eager-build guideline. It is part of the
default projection set.

The final request benchmark used 20 pages of 50 rows for each scenario:

| Scenario                         |      p95 | Failures |
| -------------------------------- | -------: | -------: |
| Overall, all events, World       |  59.7 ms |        0 |
| Gold, 3x3x3, World               |  56.1 ms |        0 |
| Bronze, United States            |  54.8 ms |        0 |
| Silver, all events, women        | 197.7 ms |        0 |
| Gold, 3x3x3, 2024, women, France |   9.4 ms |        0 |

All scenarios met the 200 ms p95 target. The least-common scenario had one
matching person. Its deep empty pages kept a total of one.

Twenty equal requests for a new key returned one cache miss and 19 coalesced
responses. All responses had status 200.

## Open work

Measure table and index sizes during the next full production projection build.
