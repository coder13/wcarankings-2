# Feed changed-result highlight

Each feed page contains five stat previews when five valid previews exist.
Each preview contains five ranking entries.

When a visible entry comes from a competition that triggered the feed stat in
the recent window, the feed passes the entry to the shared ranking row as a
highlighted row. The row uses the same visual state as a focused or searched
person.

The highlight does not change the ranking order or the result data. A recent
record that is outside the visible top five has no visible row to highlight.

The feed matches a trigger to the source event. A recent competition in another
event does not match the preview.

The feed skips a stat when no visible top-five row matches a recent trigger.

The server stores the complete feed snapshot under the current export fetched time.
The server starts one background build when that export has no snapshot. Feed requests read the stored snapshot until a new export arrives.
