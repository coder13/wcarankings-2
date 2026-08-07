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

The command replaces the stored feed rows. It prints the build time, candidate
count, stored row count, and selected top-rank limit.

To add a new statistic, add its inventory definition and source loader in
`services/feeds`. Then run this command to rebuild the feed.
