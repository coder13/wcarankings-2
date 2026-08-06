# Feed row storage and local sort

The feed stores one row for each selected interesting result in
`feed_items`. It does not store the feed as one JSON snapshot row.

Each row stores the result ID, stat identity, event, result type, region,
gender, year, world rank, continent rank, country rank, and ranking-list key.
The worker replaces rows when the export version changes.

The API uses SQL to sort rows. It applies the logged-in user's country first,
then continent, then preferred countries and continents. It also applies the
average-result boost, region-specific top-ten notability, and current ranking
popularity data. The API returns the selected rows before it loads stat
preview pages.

Family weights and the same-stat result boost are defined in
`services/feeds/constants.ts`. A stat with several interesting results gets a
small capped boost. Rank remains the main signal, so a high-ranked city can
still appear above a lower-ranked person result.

The feed does not create Men variants. It supports Everyone, Female, and
Other variants only.
