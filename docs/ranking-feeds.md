# Ranking feeds

This package contains shared feed selection rules for the person and home feeds.

Source adapters provide ranking cards. Each card includes a normalized ranking descriptor, a canonical Explore URL, five preview rows, and source-owned diversity data.

The person feed accepts a card only when the selected person has a public rank from one through five. The home feed accepts a card only when a recent top-five change exists.

The selector reads scores from `readPopularRankingDescriptors`. Popularity orders eligible cards. It does not make an ineligible card eligible.

The selector removes duplicate list keys and trigger anchors. It also spaces similar cards when another eligible card is available.

The cursor stores the ranking generation and the popularity snapshot date. A later generation starts a new feed order. This keeps pagination stable while the data changes.

This slice does not add source SQL, a home-feed change log, or a new ranking projection. Later source work can use the shared types and selector without changing the feed rules.
