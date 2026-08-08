# WCA Integrated Live Results imports

The ILR reader imports competitions that report
`scoretaking_software: "internal"` in WCA competition metadata.

## Source and endpoints

The WCA competition ID is also the remote ID. The reader first requests the
public WCIF:

```text
https://www.worldcubeassociation.org/api/v0/competitions/{competitionId}/wcif/public
```

The WCIF gives the accepted people and the round IDs. The reader then requests
each round:

```text
https://www.worldcubeassociation.org/api/v1/competitions/{competitionId}/live/rounds/{roundId}
```

The reader requests up to eight rounds at one time.

## Person and result matching

The reader maps a round `registration_id` to the WCIF `registrantId`. It uses
the WCIF person data for the WCA ID, name, and country.

The reader ignores rows that do not map to a WCIF person with a WCA ID and
name. It maps each attempt value, best, average, and global position into the
normalized live-result row.

The result ID is `{roundId}:{wcaId}`. The reader gets the event ID and numeric
round number from a round ID such as `333-r2`.

## Unsupported rounds

The reader skips head-to-head rounds. It identifies these rounds from format
`h`, or from match fields in the result rows.

The snapshot records skipped round IDs. The poller writes a warning with the
competition and skipped IDs. A skipped round does not write provisional result
rows.

## Final rounds and retry

After the reader collects all event rows, it marks the highest numbered round
for each event as final (`f`). Other rounds use their numeric round type.

The reader retries transient WCA errors up to three times. It retries network
errors, HTTP `429`, and HTTP 5xx responses.
