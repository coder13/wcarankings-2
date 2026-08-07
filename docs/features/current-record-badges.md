# Current record badges

Record badges show the current record state.

- Do not use a historical `NR`, `CR`, or `WR` value as a current badge.
- A result can have set a record in the past and have no badge now.
- Current ranking position data is the source for the badge.
- This rule applies to current-year and previous-year ranking views.

The raw result facts keep historical record codes for data history. Ranking
queries must compare the result with the current generated ranking position
before they return a record badge.
