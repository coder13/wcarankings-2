# Statistics catalog

This folder contains one file for each product statistic or ranking family.
Each file records the list row or stat row, source data, required indexes, query-plan
findings, build cost, and request policy.

The files use these status labels:

- **Active**: the projection is in the deployment groups and serves a product request.
- **Lazy**: the common path is stored, but a narrow filter is ranked on demand and cached in a bounded window.
- **Planned**: SQL or an architecture note exists, but the statistic is not in the active deployment contract.
- **Foundation**: the table supports other statistics and is not itself a user-facing list.

## Active statistics

- [Single result rankings](single-result-rankings.md)
- [Average result rankings](average-result-rankings.md)
- [Gender-filtered result rankings](gender-filtered-result-rankings.md)
- [Person-event rankings](person-event-rankings.md)
- [Person-year rankings](person-year-rankings.md)
- [Sum of Ranks and Kinch](sum-of-ranks-and-kinch.md)
- [Person-competition rankings](person-competition-rankings.md)
- [Medal rankings](medal-rankings.md)
- [Competition rankings](competition-rankings.md)
- [City-event statistics](city-event-stats.md)
- [Ranking counts and list metadata](ranking-counts-and-metadata.md)

## Foundation and planned work

- [Result facts](result-facts.md)
- [Ranking tables](ranking-tables.md)
- [Weekly rank changes and record streaks](weekly-rank-changes-and-record-streaks.md)

The canonical architecture document gives the shared contracts and naming rules.
These files add the stat-specific operating record:
[projection architecture](../projection-architecture.md).

The performance rules for new statistics are in
[statistics performance guidelines](../statistics-performance-guidelines.md).

## Maintenance rule

Add or update the matching file in the same pull request as a new statistic,
projection, index, or request path. Record measured build and request times with
the data generation date. Do not report a plan as measured evidence.
