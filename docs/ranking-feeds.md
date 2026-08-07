# Ranking feeds

This package contains shared feed selection rules for the person and home feeds.

Source adapters provide ranking cards. Each card includes a normalized ranking descriptor, a canonical Explore URL, five preview rows, and source-owned diversity data.

The person feed accepts a card only when the selected person has a public rank from one through five. The home feed accepts a card only when a recent top-five change exists.

The selector reads scores from `readPopularRankingDescriptors`. Popularity orders eligible cards. It does not make an ineligible card eligible.

The selector removes duplicate list keys and trigger anchors. It also spaces similar cards when another eligible card is available.

The cursor stores the ranking generation and the popularity snapshot date. A later generation starts a new feed order. This keeps pagination stable while the data changes.

This slice does not add source SQL, a home-feed change log, or a new ranking projection. Later source work can use the shared types and selector without changing the feed rules.

## Recent home candidates

The `/feed` endpoint reads competitions that ended during the last seven days. The query returns at most 50 trigger rows. It joins recent results to find event IDs.

The precomputation function accepts injected candidates. It keeps candidates that contain semantic change metadata. It does not scan ranking filters or generate source-specific variants.

The source supplies previous and current top-five rows through a pure comparison hook. The comparison reports leader, entry, exit, movement, and value changes.

The endpoint returns injected candidates for tests. The production trigger adapter is missing because the current schema has no old-generation change table. This slice does not add a migration or refresh data.

The measurement hook reports trigger query time, pure candidate-path time, trigger count, and candidate count. The current bound is 50 trigger rows and five cards per response.

The estimated work for this slice is one bounded trigger query plus bounded ranking reads. Ranking source adapters, preview loading, and durable old-generation comparison remain later work.

## Feed preview experiment

The feed page uses the profile `StatPreviewTable` component. It shows one vertical list of stat previews. Each preview has an Explore action.

The feed checks a fixed catalog of person and result rankings. A stat qualifies when one of its current top-five rows comes from a competition that ended during the last seven days. This is a recent-result signal, not a historical top-five diff.

The page returns five qualifying stats per request. A scroll sentinel fetches the next bounded source page before it enters view. The feed has no user-specific state.

The inventory contains person and result variants for the selected events and result types. It expands each variant across world, all continents, all countries, all three gender filters, and all-time plus 2026 rankings. It does not include prior-year lazy variants.

The inventory also contains Sum of Ranks, Kinch, PR Streak, and person activity
by countries, rounds, and official solves. Competition podium, competitor-count,
latitude, and medal-metal variants remain planned.

The inventory is lazy. Each request scans five inventory entries and returns at most five previews. A later change can replace the recent-result signal with the completed previous-generation comparator.
