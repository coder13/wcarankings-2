# Live results import process

The live poller is a long-running Node.js process. The projection worker is a
separate process. The poller does not build projections itself.

## Discovery

At startup, and once per UTC day, the poller reads active competitions from the
`competitions` table. It reads WCA metadata for each competition and records a
source row in `provisional_live_result_sources`.

The source row stores the provider, remote competition ID, poll interval,
current snapshot hash, next poll time, lease, and last import result. When a
competition is no longer active, discovery disables its source row.

The poller reads `live_results_settings` at least once per minute. A changed
poll interval updates eligible active source rows and their next poll time.

## Polling and leases

The poller claims one due source at a time. The claim uses a database lease,
so another poller cannot import the same source at the same time.

The lease lasts 120 seconds by default. The worker clears the lease after a
successful import or an error. An expired lease can be claimed after a worker
restart.

The poller uses `next_poll_at` and `poll_seconds` for each source. The process
wait interval only controls how often it looks for a due source.

## Snapshot processing

Each provider returns normalized result rows. A row includes the source result
ID, person WCA ID, event, round, result values, attempts, and position.

The poller creates a canonical hash for the full snapshot and a hash for every
event and round. If the full hash is unchanged, the poller updates the source
status and does not write result rows or jobs.

If a snapshot changes, the poller replaces rows for only the changed rounds.
It also deletes rows for rounds that disappeared from the source. The write,
round hashes, source hash, and source version use one database transaction.

The tables are:

- `provisional_live_result_sources` stores source state.
- `provisional_live_results` stores the latest normalized rows.
- `provisional_live_result_round_hashes` stores per-round fingerprints.
- `provisional_live_result_state` stores the shared source version.

## Projection jobs

After a committed snapshot change, the poller creates granular BullMQ jobs.
Jobs use a stable rebuild key. A later version updates a waiting job instead of
adding another job for the same key.

The projection worker reads jobs from Redis. It runs the matching projection
handler and records job duration. If input changes during a job, the worker
reads the newer version and runs one follow-up job.

The job set covers affected competition, city, person, person-event, medal,
and ranking slices. The current-year result-ranking endpoint reads the live
overlay directly. The poller does not queue a materialized result-ranking job.

## Manual import

Use a manual import to read one registered competition immediately:

```sh
bun run --cwd apps/live-results-worker poll --competition ExampleOpen2026
```

Use `register` only when automatic discovery cannot create the source row:

```sh
bun run --cwd apps/live-results-worker register -- \
  cubing-china ExampleOpen2026 example-open-2026 3600
```

The command only permits the current UTC year. It requires `DATABASE_URL` and
`REDIS_URL` from `.env.local`.

## Errors

A WCA Live `404` means that results are not published yet. The poller records
that condition and waits until the next scheduled poll.

Other import errors clear the lease, store the error text, and schedule a
retry after 60 seconds. The worker log records the provider and competition ID.
