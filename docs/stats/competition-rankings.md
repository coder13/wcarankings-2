# Competition rankings

Status: **Active**

## What it ranks

This family contains competition-level and competition-event statistics:

- Competitor Count, Northernmost, and Southernmost competition lists;
- fastest Single and Average by competition and event;
- podium score by competition and event;
- auditable podium members.

The stat rows represent a competition, a competition and event, or a podium
member for a competition and event.

## Source data

The builds read `competitions` for dates and coordinates, `results` for
competitor counts and fastest result values, and `competition_podium_members`
for official podium components. The current competition group does not require
`result_facts`.

The projection catalog is in
[groups.ts](../../data-tools/projection-catalog/groups.ts).

## Indexes

`competition_stats` needs a primary key on competition ID and page indexes for
competitor count, northernmost, and southernmost position.

`competition_event_stats` needs a primary key on competition and event and
page indexes for fastest Single, fastest Average, and podium position by event.

`competition_podium_members` needs indexes for competition-event membership
and result-type ordering.

## EXPLAIN summary

The competition-count review found a reversed person-first index path. A
`(competition_id, person_id)` index on raw `results` matches the
distinct-person aggregate. Date and coordinate windows still sort the complete
competition set during a rebuild, which is expected. Request queries must use
stored positions.

The competition-event build groups raw results once per competition and event,
then ranks the compact aggregate. Podium membership is joined after the
aggregate rather than recalculated in every page request.

## Build evidence

Earlier full export:

- podium members: `27.978 s` (`00:27.98`), `393,619` rows;
- competition stats: `55.735 s` (`00:55.74`), `18,291` rows;
- competition-event stats: `54.212 s` (`00:54.21`), `140,097` rows.

## Request policy

Page from the competition or competition-event position index. Join selected
competition, person, country, and result display data after paging.
