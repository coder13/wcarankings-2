# WCA Live imports

The WCA Live reader imports competitions that report
`scoretaking_software: "wca_live"` in the WCA competition metadata.

## Source and endpoint

The WCA competition ID is also the remote ID. The reader requests:

```text
https://live.worldcubeassociation.org/api/competitions/{competitionId}/results
```

The public response contains people, events, rounds, and results. The reader
uses the people list to resolve a result to a WCA ID, name, and country.

The reader rejects result rows without a person WCA ID or name. It retains
valid result values and attempts, including zero, DNF, and DNS values.

## Rounds

WCA Live gives each round a numeric round number. The reader marks the highest
round number for an event as final (`f`). Other rounds use their numeric type.

The snapshot hash includes all normalized rows. The round hash uses the event
ID and numeric round number.

## Availability and retry

The WCA Live endpoint can return `404` before scoretaking publishes results.
The reader treats this response as “results not published yet.” The poller
stores that status and waits for the next poll.

The reader retries transient WCA errors up to three times. It retries network
errors, HTTP `429`, and HTTP 5xx responses. It does not retry a `404` result.

## Example

For `RajshahiCubeOpen2026`, the request is:

```text
https://live.worldcubeassociation.org/api/competitions/RajshahiCubeOpen2026/results
```

The poller uses this endpoint without a WCIF request.
