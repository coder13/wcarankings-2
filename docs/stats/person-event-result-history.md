# Person event result history

Status: **Active**

## What it ranks

This API ranks one person's official Single attempts or Average results for one
event. The best result has rank 1. Equal values have the same public rank.
Position gives each row a stable order.

The API route is:

```text
GET /api/people/{wcaId}/event/{eventId}/results?result=single|average&year=2023
```

`start` is one-based. `limit` is from 1 through 100. The UI does not link to
the API route directly.

The page route is:

```text
/profile/{wcaId}/results?eventId=333&resultType=single&year=2023
```

The URL selects the person. The page uses the normal rankings header, rail,
bottom pager, footer, and result-row layout. Its rail has event, Single or
Average, and year selectors. Person profile pages link to this page. It reads
the API route in 100-row pages.

## Source data

The route reads the active `result_rankings_single` and
`result_rankings_average` tables. It does not read raw WCA result tables.

Single ranks ties by value, competition date, competition ID, result ID, and
attempt number. Average ranks ties by value and result ID. The API joins names
and competition data after it selects the bounded page window.

## Request policy

The route filters by person and event before it ranks rows. A selected year is
also filtered before ranking. Singles use their stored competition date.
Averages read the date from `result_facts`. The existing
`(person_id, event_id, world_position, result_id[, attempt_number])` indexes
bound this candidate set. A generation-keyed 400-row memory window caches
adjacent pages and joins equal requests in flight.

## Build and request evidence

No new table or index is created. The pre-computation duration is 0 seconds.

The local persistent development snapshot had data version `2026-07-28 12:35:57`.
The database candidate counts were 1,287 3x3 Single attempts for Cailyn
Sinclair, 2,608 for Feliks Zemdegs, and 374 3x3 Averages for Calvin Nielson.

Twenty-five raw source-query samples gave these results:

| Query                       |   p50 |   p95 |
| --------------------------- | ----: | ----: |
| Cailyn Sinclair 3x3 Singles | 33 ms | 35 ms |
| Feliks Zemdegs 3x3 Singles  | 35 ms | 37 ms |
| Calvin Nielson 3x3 Averages | 31 ms | 33 ms |

The projection-backed Feliks 3x3 Single API scroll used 27 requests of 100
rows. Its cache-miss p95 was 20 ms. Its cache-hit p95 was 4 ms. The miss and
hit timings include the local HTTP request.

Calvin's WCA ID is `2014NIEL03`. The source name uses the spelling Nielson.

## PR History preview

The profile PR History preview shows a person's result improvements by
competition. It supports one event, result type, and optional year. Its Chart
and Table views use the same data. The chart tooltip shows the result,
competition, and date.

The endpoint reads the existing `result_rankings_single` or
`result_rankings_average` projection. It groups one person's event results by
competition, then keeps only the new running best values in date order. Average
results join `result_facts` for competition dates. The endpoint does not read
the raw `results` table.

This preview has no new pre-computation. The pre-computation duration is 0
seconds. Its memory cache key includes data version, person, event, result
type, and year. Equal requests share an in-flight load.

On 2026-08-05, 31 warm local requests for Teodor Zajder's all-time 3x3 Single
history returned in 5.4 ms at p50 and 6.3 ms at p95. The response had 16
improvement points. One local cache miss took 10.4 ms. Query-plan review is
pending because this prototype uses the existing person-event projection index.
