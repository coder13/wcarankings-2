# Profile top-ranking highlights

Status: **Prototype**

## Purpose

This profile feed shows ranking views where the profile owner ranks in the top
five. It appears after the fixed profile statistics.

The feed does not create a statistic, a table, or a projection. It reads the
existing person-event ranking data.

## Candidate source

The service reads the owner rows from `person_event_rankings`. It keeps a row
when the owner has a World, continent, or country rank from 1 through 5.

Each matching row can produce these existing ranking views:

- all-time, unfiltered;
- all-time, filtered to the owner's gender;
- the year of the retained personal-best result;
- that year, filtered to the owner's gender.

The service checks the final view before it sends the card. It discards a
year-filtered view when the owner does not rank in its top five.

The current source is person-event rankings. Competition podium rows rank
competitions, not people. The feed does not describe a competition rank as a
person rank.

## Paging and order

The endpoint is:

```text
GET /api/people/{wcaId}/top-ranking-highlights?cursor=0&shown={statId}
```

Each response contains at most five cards. Every card contains five ranking
rows. The service starts two positions before the owner. At the top of a list,
it shows the owner and the next four rows.

The client sends the IDs of cards that it already rendered. The service skips
these IDs. The cursor moves through a stable candidate order.

The service groups candidates by event and takes one candidate from each event
before it takes another candidate for that event. This keeps nearby cards from
describing the same event when other event choices exist.

## Data and cache policy

The endpoint uses `person_event_rankings` and the existing ranking service.
It does not read raw WCA result tables.

The endpoint cache key contains the ranking data version, WCA ID, cursor, and
shown card IDs. Equal requests share one in-flight request. A new ranking data
version uses a different cache key.

There is no new pre-computation. The pre-computation duration is 0 seconds.

## Measured request time

On 2026-08-05, the local first request for `2021ZAJD03` took 74 ms. The
request loaded five cards.

Twenty-five warm requests returned in 5.4 ms at p50 and 6.4 ms at p95.
