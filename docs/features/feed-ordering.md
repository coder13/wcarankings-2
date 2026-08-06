# Feed ordering

Feed candidates use tunable values in
`services/feeds/constants.ts`.

The order favors a world top-ten result, then a continent top-ten result, then
a national top-ten result. A better rank within the same scope receives a
small extra score. Average results receive a bonus over single results.

For a signed-in user, country stats for the user's WCA country receive the
largest location bonus. Countries where the user competed most often receive a
smaller bonus. The same rule applies to the user's continent and most visited
continents.

The feed also reads recent ranking-list popularity at request time. A popular
stat receives a larger score after the ranking and personal-location signals
are applied. Popularity is not stored in the export snapshot.

The candidate snapshot stores raw rank positions, not a calculated notability
score. Notability and personal location sorting are applied when the page
reads the snapshot, so both can change without rebuilding the feed.
