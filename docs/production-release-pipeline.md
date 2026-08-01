# Production release pipeline

This is the operational description of the production release pipeline as of
2026-08-01. It supplements the schema contract in
[Projection Architecture](projection-architecture.md). The workflow files are
the executable source of truth.

## Two independent release lanes

Every push to `main` starts two GitHub Actions workflows:

- **Server Production Release** builds or reuses component images, then
  deploys the application and configuration. It uses the
  `production-server-release` queue.
- **Projection Production Release** first checks whether a projection's
  *semantic* inputs changed. It uses the independent
  `production-projection-release` queue.

They have separate queues so a long projection build does not make an ordinary
server/UI release wait. Both nevertheless take the same short
`production-mutation.lock` only while changing production state. This prevents
image cleanup, configuration recovery, and projection activation from racing.

`cancel-in-progress` is false for both queues: an in-flight safe release may
finish and the newest pending release is retained.

## What a cosmetic merge does

A CSS or presentation-only change changes the application component image but
does not change a projection semantic fingerprint. The expected path is:

1. The server workflow reuses unchanged Flyway and data-tools component images,
   builds/publishes only the application image if its component digest is new,
   then stages and switches the app.
2. The projection plan reads the active state, calculates source-only semantic
   fingerprints, and exits with **“No semantic projection inputs changed; the
   WCA export was not resolved.”**
3. No WCA download, runner-local MariaDB import, projection SQL, artifact
   publication, candidate projection schema, or production projection swap is
   performed.

That makes a cosmetic merge a useful release-latency benchmark without risking
an unnecessary rankings regeneration.

## Projection fingerprints and immutable artifacts

Each projection group has two related identifiers:

- A `semanticFingerprint` hashes only group-owned SQL, relevant result
  migrations, transformation/schema-definition code, the group schema version,
  and transitive semantic dependencies. App migrations, Compose/Caddy files,
  logging/progress code, deployment scripts, and unrelated package metadata are
  intentionally excluded.
- An `artifactFingerprint` combines that semantic fingerprint with the WCA
  export identity, MariaDB compatibility version, artifact format version, and
  transitive artifact fingerprints.

Artifacts are immutable OCI/GHCR packages, one checksummed archive plus
metadata per group and artifact fingerprint. A proposed reuse is verified for
the archive checksum, group/table ownership, export identity, both
fingerprints, MariaDB compatibility, and artifact format before it is trusted.
A bad artifact is quarantined and rebuilt using a repair identity, so it cannot
poison the original cache identity.

The current groups are `compatibility`, `result-facts`, `result-rankings`,
`competition-rankings`, `city-rankings`, `sum-of-ranks`, and
`yearly-person-rankings`. The planning result distinguishes:

- **active**: production already has the exact desired artifact;
- **cached**: a valid exact GHCR artifact can be restored;
- **hydrate**: a cached upstream artifact needed locally by a downstream build;
- **build**: no valid exact artifact exists.

When the WCA export changes, all export-dependent groups are selected to keep
one coherent generation, but any same-export group artifact may still be
restored instead of regenerated.

## Build, staging, and activation safety

Projection SQL runs only in runner-local MariaDB. The scheduler has a default
`WCA_PROJECTION_BUILD_CONCURRENCY=2`, gives workers separate connections, and
starts a dependent only after its prerequisites built or hydrated successfully.
It favors long ready work while pairing it with short independent work. Cached
and hydrated tables are not counted as pending work.

Production imports are deliberately sequential. Each artifact is prepared in a
unique candidate schema; active tables continue serving throughout upload,
import, and indexing. During candidate work the deployment probes the direct
core-ranking API every five seconds. Three consecutive failures or responses
over two seconds abort candidate work without changing active tables.

Only final validation, supersession validation, atomic table rename,
generation-state update, affected-capability smokes, and any immediate rollback
are covered by the projection activation lock. Generation state stores the
export, per-group semantic/artifact fingerprints and digests, source SHA, and
explicit capabilities. A capability turns on only after all of its required
tables have been validated and atomically activated.

## Server release safety

Component hashes are independent for the application image, Flyway image,
data-tools image, and Compose/Caddy configuration. Production normally requires
PR-validated component digests; manual emergency dispatch has an explicit
rebuild option. The deployed commit SHA is injected when the app is activated.

Before the server cutover, the workflow records a pre-migration MariaDB load
baseline, then requires three bounded samples returning to a stable relative
band after migration activity. It captures the running app image ID before
candidate retagging, records staged configuration state under lock, and can
restore the exact prior image/configuration if a release fails or is cancelled.
It never removes explicitly protected current/previous service tags or
artifact-scoped data-tools/Flyway tags during cleanup.

The release verifies local readiness and core rankings, retries the SSR root
request and its extracted CSS asset with bounded diagnostics, then verifies the
public proxy. The root/CSS retries protect against startup routing races without
silently accepting an unavailable page.

## Observed production evidence

| Date / run | Evidence | Result |
| --- | --- | --- |
| 2026-08-01, server run `30708219708` | Sum-of-Ranks server fix with app migration V13 | Switched successfully. Public root, readiness, core rankings, results, yearly, Sum of Ranks, and competition endpoints all returned 200; the new `(wca_id, sub_id)` person lookup index was present. |
| 2026-08-01, projection run `30705975286`, retry attempt 2 | Reused existing artifact `8820359138` after a prior Sum-of-Ranks timeout | All 25 group artifacts restored; no projection SQL or raw WCA import was repeated. The already-prepared candidate completed safely and all six capabilities became active. |
| 2026-08-01, PR #149 / server run `30709139959` | CSS-only ranking-rail shadow polish | Merged at `16:53:42Z`; the new public CSS asset returned 200 at `16:57:00.643Z`, an observed merge-to-public latency of **3m 19s**. The server workflow completed at `16:57:05Z` (3m 23s after merge). |
| 2026-08-01, projection run `30709139971` | Projection control path for the same CSS-only merge | Completed in 27 seconds. It calculated semantic fingerprints, emitted the cosmetic-gate message, and skipped WCA resolution, artifacts, build, and deployment. |

The cosmetic benchmark recorded four timestamps:

1. `T0` merge completion: `2026-08-01T16:53:42Z`;
2. server workflow created at `16:53:44Z`; its image job took 45 seconds and
   the entire workflow completed at `16:57:05Z`;
3. server switch completed at `16:56:57Z`; the first external probe at
   `16:57:00.643Z` saw `/assets/index-BWh7BXIH.css` and received 200;
4. projection plan completed in 27 seconds with **“No semantic projection
   inputs changed; the WCA export was not resolved.”**

The measured user-visible cosmetic-release latency is therefore **at most 3m
19s** from merge. The bound is conservative: the probe interval establishes
that the cutover happened after the prior old-asset probe and no later than the
first successful new-asset probe. The corresponding Actions runs are
[server `30709139959`](https://github.com/coder13/wcarankings-2/actions/runs/30709139959)
and
[projection `30709139971`](https://github.com/coder13/wcarankings-2/actions/runs/30709139971).

## Investigated but not planned: pruning historical person names

The raw `persons` table contains historical name rows distinguished by
`sub_id`. A local, isolated MariaDB experiment found 293,306 `sub_id = 1` rows
and only 452 historical rows (`0.154%`, representing 448 people). Existing app
and projection references already explicitly select `sub_id = 1`; projection
checksums were unchanged after removing the historical rows in the disposable
copy. The relevant Sum-of-Ranks lookup was fast with the `(wca_id, sub_id)`
index and exceeded 20 seconds without it. Removing rows did not reclaim InnoDB
disk space without a table rebuild. Therefore this is not an active
optimization: retain history and the index unless a future measured
rebuild-and-swap change makes the tradeoff worthwhile.
