# WCA Results Export v2 reference

Source: `https://www.worldcubeassociation.org/export/results` and
`https://www.worldcubeassociation.org/api/v0/export/public`, verified
2026-08-06. The verified format was v2.0.2. Recheck the live sources whenever a
task depends on the current export date, URL, size, API shape, or minor version.

## Contents

- [Distribution and metadata](#distribution-and-metadata)
- [Tables](#tables)
- [Results and attempts](#results-and-attempts)
- [Special cases](#special-cases)
- [v2 changes to account for](#v2-changes-to-account-for)
- [Republishing notice](#republishing-notice)

## Distribution and metadata

- The WCA normally updates the public export after competition weekends once
  results are finalized.
- Results Export v1 is deprecated; its published support cutoff was 2026-01-15.
  Use v2 and do not add a v1 fallback unless a user explicitly requests legacy
  compatibility.
- The SQL archive contains statements for SQL database import.
- The TSV archive contains UTF-8 tab-separated files for spreadsheets and
  other flat-file processing.
- `/export/results/v2/sql` and `/export/results/v2/tsv` resolve to the latest v2
  archives. A versioned permalink stays on that major version when a future
  version is released.
- Each archive includes `README.md` and `metadata.json`.
- Archive metadata uses `export_date` and `export_format_version`.
- The public API exposes freshness and download information. On the verification
  date its version field was `export_version`, while archive metadata used
  `export_format_version`; inspect the live payload rather than assuming the
  names match.
- Use `export_date` to detect a new export and the returned `sql_url` or
  `tsv_url` to download it.
- Subscribe to the WCA Software Mailing List in WCA profile preferences for
  format-version notifications.

## Tables

| Table | Contents |
| --- | --- |
| `persons` | WCA competitors |
| `competitions` | WCA competitions |
| `events` | WCA events and value formats |
| `results` | One competitor's result in one competition, event, and round |
| `result_attempts` | Individual attempts belonging to a result |
| `ranks_single` | Best single per competitor and event, with ranks |
| `ranks_average` | Best average per competitor and event, with ranks |
| `round_types` | Round types |
| `formats` | Round formats such as best of 3 and average of 5 |
| `countries` | Countries |
| `continents` | Continents |
| `scrambles` | Scrambles |
| `championships` | Championship competitions |
| `eligible_country_iso2s_for_championship` | Citizenship eligibility for special cross-country championship types |

## Results and attempts

- A `results` row is the overall result achieved by a competitor in a round.
- `results.best` is the best single solve in that round.
- `results.average` is the round average when that format produces one.
- Join `results.id = result_attempts.result_id` to obtain the individual solves.
- Use `result_attempts.attempt_number` for attempt order.
- `-1` means DNF (Did Not Finish).
- `-2` means DNS (Did Not Start).
- `0` means no result. A best-of-3 round, for example, has `0` for its average.
- A positive value must be decoded according to the related event's `format`.
- Consult WCA Regulations Article 9 when a task depends on the rules for how an
  event or result is measured.

### Time values

For most events, `format = time` and the stored value is centiseconds. For
example, `8653` represents 1 minute 26.53 seconds.

### Number values

`format = number` is a raw number and is currently used for Fewest Moves.
Fewest Moves averages are stored as 100 times the rounded average, so decode
that average separately from individual move counts.

### Multi-blind values

Old multi-blind values use `1SSAATTTTT`:

```text
solved         = 99 - SS
attempted      = AA
timeInSeconds  = TTTTT
```

New multi-blind values use `0DDTTTTTMM`:

```text
difference     = 99 - DD
timeInSeconds  = TTTTT
missed         = MM
solved         = difference + missed
attempted      = solved + missed
```

For either encoding, `TTTTT = 99999` means the time is unknown. To encode the
new format:

```text
missed         = attempted - solved
DD             = 99 - (solved - missed)
TTTTT          = solve time in seconds
MM             = missed
```

The decimal ordering is intentional: smaller values are better. The encoding
does not support more than 99 attempted cubes or times above 99,999 seconds.

## Special cases

- Country rows can include historical countries. `iso2` normally follows ISO
  3166-1 alpha-2, but custom codes can occur.
- A `333mbf` attempt contains multiple newline-separated scrambles. The TSV
  export replaces those newlines with `|` for parser compatibility.
- `eligible_country_iso2s_for_championship` maps a special championship type to
  eligible citizenship codes. For example, `greater_china` includes `CN`, `HK`,
  `MO`, and `TW`.

## v2 changes to account for

- v2.0.0 converted table names to snake_case.
- Renames included `competitions.wcaDelegate` to `competitions.delegates`,
  `competitions.organiser` to `competitions.organizers`, latitude/longitude to
  `latitude_microdegrees`/`longitude_microdegrees`, `persons.id` to
  `persons.wca_id`, `persons.subid` to `persons.sub_id`, and
  `scrambles.scramble_id` to `scrambles.id`.
- Removed columns included continent latitude/longitude/zoom,
  `eligible_country_iso2s_for_championship.id`, `events.cellName`, and
  `results.value1` through `results.value5`.
- v2 added `results.id` and moved attempts to `result_attempts`.
- v2.0.1 fixed missing result/attempt keys and TSV scramble SQL rendering.
- v2.0.2 removed `id`, `created_at`, and `updated_at` from `result_attempts` and
  changed `attempt_number` to an unsigned tiny integer.

## Republishing notice

When republishing export information in whole or in part, clearly notify users:

> This information is based on competition results owned and maintained by the
> World Cube Association, published at https://worldcubeassociation.org/results
> as of `<export date>`.

Replace `<export date>` with the actual date of the data being presented.
