---
name: wca-results-export
description: Explain and interpret the contents of the World Cube Association Results Export v2. Use when identifying export tables, understanding results and result_attempts, decoding DNF/DNS/no-result values, formatting time and Fewest Moves values, decoding old or new multi-blind results, or handling documented export-specific edge cases.
---

# WCA Results Export

Use this reference to understand the meaning of data in the official WCA
Results Export v2. Keep the scope to export contents and encodings; inspect the
archive's SQL definitions or TSV headers when exact column-level schema is
needed.

## Tables

| Table | Contents |
| --- | --- |
| `persons` | WCA competitors |
| `competitions` | WCA competitions |
| `events` | WCA events and their result formats |
| `results` | Results per competition, event, round, and person |
| `result_attempts` | Individual attempts that make up a `results` row |
| `ranks_single` | Best single per competitor and event, with ranks |
| `ranks_average` | Best average per competitor and event, with ranks |
| `round_types` | Round types such as first and final |
| `formats` | Round formats such as best of 3 and average of 5 |
| `countries` | Countries |
| `continents` | Continents |
| `scrambles` | Scrambles |
| `championships` | Championship competitions |
| `eligible_country_iso2s_for_championship` | Citizenship eligibility for special cross-country championship types |

## Results and attempts

- Treat a `results` row as one competitor's overall result in one round.
- Read `results.best` as the best single solve in the round.
- Read `results.average` as the round average when the round format produces
  one.
- Join `results.id = result_attempts.result_id` to find the individual attempts.
- Order attempts with `result_attempts.attempt_number`.
- Do not look for `results.value1` through `results.value5`; v2 moved attempts
  into `result_attempts`.

## Result values

Interpret values in `results` and `result_attempts` as follows:

| Value | Meaning |
| --- | --- |
| `-1` | DNF — Did Not Finish |
| `-2` | DNS — Did Not Start |
| `0` | No result; for example, a best-of-3 round has no average |
| Positive | Decode according to the event's `format` |

### Time

For most events, `format = time` and the value is centiseconds. Interpret `8653`
as 86.53 seconds, or 1 minute 26.53 seconds.

### Number and Fewest Moves

For `format = number`, treat the value as a raw number. This is used for Fewest
Moves. Treat an individual attempt as a move count, but divide a Fewest Moves
average by 100 because averages are stored as 100 times the rounded average.

### Multi-blind

Pad the stored positive integer to 10 digits before splitting it into fields;
this restores the leading `0` used by the new encoding.

Decode old multi-blind values in the form `1SSAATTTTT`:

```text
solved         = 99 - SS
attempted      = AA
timeInSeconds  = TTTTT
```

Decode new multi-blind values in the form `0DDTTTTTMM`:

```text
difference     = 99 - DD
timeInSeconds  = TTTTT
missed         = MM
solved         = difference + missed
attempted      = solved + missed
```

For example, pad `870360001` to `0870360001`. This gives `DD = 87`,
`TTTTT = 03600`, and `MM = 01`: 13 solved out of 14 attempted in 3,600 seconds.

Encode a new multi-blind value with:

```text
missed         = attempted - solved
DD             = 99 - (solved - missed)
TTTTT          = solve time in seconds
MM             = missed
```

Treat `TTTTT = 99999` as an unknown time. Remember that the encoding is designed
so a smaller decimal value is a better result. It supports at most 99 attempted
cubes and 99,999 seconds.

## Export-specific details

- Expect UTF-8 data.
- In the TSV export, replace `|` with newlines when interpreting the multiple
  scrambles that make up a `333mbf` attempt.
- Allow for historical countries and occasional custom country codes even
  though `countries.iso2` normally follows ISO 3166-1 alpha-2.
- Interpret `eligible_country_iso2s_for_championship` as the mapping from a
  special championship type to citizenship codes eligible to win it. For
  example, `greater_china` includes `CN`, `HK`, `MO`, and `TW`.
- Expect snake_case table names in v2. Key v2 changes include `persons.wca_id`,
  `persons.sub_id`, `competitions.delegates`, `competitions.organizers`,
  `competitions.latitude_microdegrees`, `competitions.longitude_microdegrees`,
  and `scrambles.id`.
- Do not expect `id`, `created_at`, or `updated_at` on `result_attempts` in
  v2.0.2; identify an attempt by its result and attempt number.

## Accuracy

- Use the export's bundled `README.md` and `metadata.json` as the authority for
  the archive being examined.
- Check `https://www.worldcubeassociation.org/export/results` when the current
  export version matters; this skill describes v2 and should not be treated as
  a promise about future major versions.
- Inspect SQL `CREATE TABLE` statements or TSV headers before naming columns or
  joins not documented above.
