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

The estimated work for this slice is one bounded trigger query plus in-memory candidate filtering. Ranking source adapters, preview loading, and durable old-generation comparison remain later work.
