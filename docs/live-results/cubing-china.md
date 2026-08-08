# Cubing China imports

The Cubing China reader imports Chinese competitions that report
`scoretaking_software: "external"` in WCA metadata.

## Alias discovery

The reader needs a Cubing China competition alias. The poller reads it from the
WCA competition website URL.

For this URL:

```text
https://cubing.com/competition/Maoming-Open-2026
```

the remote ID is `Maoming-Open-2026`.

If the website does not contain a supported Cubing China URL, the poller uses
the WCA competition ID as a fallback. Register the source manually with the
correct alias if that fallback does not work.

## Requests

The reader first requests the competition competitor list:

```text
https://cubing.com/api/v0/competition/competitors?alias={alias}
```

Cubing China can return the person data under `user`, `competitor`, or the
outer row. The reader supports all three forms.

For each competitor, it then requests the live result rows:

```text
https://cubing.com/live/{alias}/userResults?user[number]={number}&user[wcaid]={wcaId}
```

The reader requests up to eight competitors at one time. It retains rows where
`t` is `"r"`. Other rows are event headers.

## Normalization

Cubing China can return result IDs and event IDs as JSON numbers. The reader
converts these values to strings before it validates the row.

It maps `i`, `e`, `r`, `f`, `b`, `a`, `v`, and `p` to the normalized result ID,
event, round, format, best, average, attempts, and position fields.

An empty format becomes `null`. The reader determines the final round after it
collects all results for an event.

## Example: Maoming Open 2026

`MaomingOpen2026` uses the alias `Maoming-Open-2026`. The reader imports its
results from Cubing China, not WCA Live.
