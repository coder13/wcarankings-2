# Feed statistic family coverage

The feed currently includes these additional person statistics:

- Sum of Ranks.
- Kinch.
- Activity by countries.
- Activity by rounds.
- Activity by official solves.
- PR Streak.

The feed uses the existing ranking services and projection tables. It does not
add a new projection table. It stores one feed row for each selected result.

The feed rebuild on 2026-08-06 took 8.38 seconds on the Bespin MariaDB pod.
The build found 1,010 candidates and stored 84 deduplicated rows.

The next planned families are competition podium, competitor count, latitude,
and gold, silver, and bronze medal rankings.

## Manual generation

Run the feed build with the configured database:

```bash
pnpm run feed:generate
```

Include changed results through rank 25 with:

```bash
pnpm run feed:generate -- --top-rank=25
```

Show the command options with:

```bash
pnpm run feed:generate -- --help
```

Benchmark the current SoR lookup for people and regions touched by recent
results with:

```bash
pnpm run feed:generate -- --benchmark-sor
```

This benchmark reads the current `person_sum_of_ranks_scores` projection and
does not write feed rows. The projection stores current scores only. It does
not measure an exact seven-day or 2026 historical delta calculation.

The command replaces the stored feed rows. It prints the build time, candidate
count, stored row count, and selected top-rank limit. It also reports:

- the database host and export version used;
- trigger and result-reference query times;
- each recent competition trigger and its available event descriptors;
- the number of inventory entries by statistic and event; and
- the number of generated candidates by statistic and event.

This report shows which competitions and statistic families the build examined.
It also helps identify a missing source adapter when a recent competition has no
event descriptors or a statistic family has no candidates.

To add a new statistic, add its inventory definition and source loader in
`services/feeds`. Then run this command to rebuild the feed.
