# Feed changed-result highlight

Each feed page contains five stat previews when five valid previews exist.
Each preview contains five ranking entries.

When a visible entry comes from a competition that triggered the feed stat in
the recent window, the feed passes the entry to the shared ranking row as a
highlighted row. The row keeps its normal alternating table color and adds a
subtle yellow tint and a narrow yellow edge marker. It does not replace the
row color with the focused or searched person color.

The highlight does not change the ranking order or the result data. A recent
record that is outside the visible top five has no visible row to highlight.

The feed matches a trigger to the source event. A recent competition in another
event does not match the preview.

The feed skips a stat when no visible five-row window matches a recent trigger.

The feed scans the top ten rows. It displays five rows around the first changed row, with four neighboring rows.

The server stores the complete feed snapshot under the current export fetched time.
The server starts one background build when that export has no snapshot. Feed requests read the stored snapshot until a new export arrives.

The snapshot format has a version. A feed behavior change creates a new snapshot for the same export.

The snapshot stores one interesting result reference per candidate. It uses the existing solve-fact result ID when the stat provides one. It does not store the five display rows. The page fetches the source stat and selects the five rows around the referenced result.

The feed inventory includes all 17 WCA events, both single and average result types, all four gender variants, all-time and 2026 variants, and person and result families.
