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
