# Deployment

> **Current production release workflow:** the historical import-and-transfer
> description below predates the independent server and projection release
> lanes. For the current workflow, operational safeguards, cache model, and
> observed production results, see [Production release pipeline](production-release-pipeline.md).

CubeRanks is deployed as a Docker Compose stack on a managed Linux host. The
production stack contains five services:

- `db`: MariaDB 11.8 with raw WCA export data and indexed ranking projections in the `mariadb_data` named volume.
- `flyway`: the pinned Flyway migration image, which applies app-owned schema migrations before deploys and scheduled imports.
- `app`: the Node/Vinext application.
- `data-tools`: the approved importer, projection publisher, and generation-activation image. Export archives are retained in the `wca_export_cache` named volume.
- `proxy`: Caddy, which terminates HTTPS and forwards requests to `app`.

## Server setup

The production host needs Docker Engine with the Compose plugin, a dedicated
non-interactive deploy account, SSH access for GitHub Actions, and a writable
deployment directory. The deploy account must be allowed to run Docker commands.

Configure DNS and firewall access for the production site, allowing HTTP and HTTPS.
Caddy stores its certificates in a persistent volume. The server's `.env` file is
created manually and is not replaced by deployments; keep its credentials out of
source control.

From the deployment directory on the production host:

```bash
cp .env.example .env
openssl rand -hex 32
# Put the generated value in the database environment configuration.
docker compose up -d db
docker compose ps
```

The application image is built by GitHub Actions and transferred to the host;
the production host does not build application images. The first deployment
starts the application and proxy after loading that image.

The app listens on `127.0.0.1:3000` on the host. Caddy publishes ports 80 and 443
and obtains certificates automatically. MariaDB has no public network port.

Apply app-owned schema migrations, then run the initial WCA import through the
`Refresh Ranking Data` GitHub Actions workflow. Production raw WCA tables and
ranking projections should not be refreshed from a server-local cron, timer, or
manual SSH command.

The Actions workflow downloads one SQL archive per export date, builds projection
transfer artifacts on the GitHub runner, and uploads a checksummed generation
bundle. Production prepares raw and projection tables in a candidate schema and
activates raw data, projections, export metadata, and generation metadata with
one cross-schema `RENAME TABLE`.

Flyway migrations and ranking projection refreshes are separate operations. To
inspect or validate app-owned migrations without importing WCA data, run
`docker compose run --rm flyway info` or `docker compose run --rm flyway validate`.
Do not run importer, backfill, or projection rebuild scripts on production by
SSH. Those scripts are packaged in the approved data-tools image for GitHub
Actions-controlled deploy/refresh commands and local development only; they are
not present in the application image.

To keep the self-hosted database current, use the `Projection Release` GitHub
Actions workflow. It runs daily at 05:17 UTC, runs semantic change detection on
main pushes, and can also be started manually from the Actions tab. Manual runs
can force group selection or explicitly bypass reusable group artifacts.

Server and projection releases have independent GitHub Actions queues. A short
host mutation lock coordinates only Compose changes, migrations, activation,
smoke checks, and rollback; projection generation and candidate staging do not
block server releases. Database activation also uses a MariaDB advisory lock.

## GitHub Actions deployment

`.github/workflows/server-production.yml` deploys the server after pushes to
`main` and supports manual dispatch. `.github/workflows/projection-release.yml`
updates projection data independently.

Pull-request checks fingerprint the application, Flyway, data-tools, and
configuration independently. They restore already validated component images and
build any component whose exact source-tree tag is not already validated. This
also lets a fresh pull request validate the combined tree after independently
validated pull requests are merged in sequence. Before publishing a component
image, the job
runs the Flyway image against temporary MariaDB, loads a small WCA-like fixture,
refreshes ranking projections using the application image, starts that exact
image, and runs a Chromium smoke test against it. The test asserts a seeded
ranking is visible and uploads a screenshot plus Playwright report as a
14-day workflow artifact. Only a successful same-repository pull request pushes
those already-tested image tags to GitHub Container Registry.

The two deployment workflows together do the following:

1. Checks out the merged commit and calculates component fingerprints.
2. Resolves matching PR-verified application, Flyway, and data-tools images
   from GitHub Container Registry. Missing images fail the release; production
   releases never build an unverified fallback.
3. Detects projection semantic changes before resolving the latest WCA export.
4. Restores exact checksummed group artifacts from GHCR, hydrates cached
   dependencies, and builds only cache-miss tables in the shared runner-local
   MariaDB database.
5. Retains immutable per-group artifacts and a checksummed release manifest.
6. Uses repository-configured SSH credentials and host verification to establish
   non-interactive access to the production host.
7. Verifies server/dataset schema compatibility and copies checksummed
   `docker-compose.yml` and `ops/Caddyfile` to the deployment directory.
8. Preserves the current image as `wcarankings-app:previous`, then removes
   obsolete application, Flyway, and data-tools image tags while retaining images used by
   running containers and the rollback image.
9. Streams the new images directly to the server with
   `docker save | gzip | ssh ... 'gzip -d | docker load'`. There is no container
   registry involved.
10. Tags the loaded application, Flyway, and data-tools images, then runs `docker compose run --rm flyway migrate`.
11. Starts and verifies the new application against the still-active compatible
    dataset. Caddy is recreated only when Compose or Caddy configuration changed.
12. Prepares a complete candidate ranking generation, including raw data when
    the export changed, without exposing candidate tables.
13. Atomically swaps candidate raw tables, changed projections,
    `export_metadata`, and `ranking_generation_state`; prior tables move to a
    retained schema.
14. Verifies readiness and real ranking endpoints. Failure atomically restores
    the retained generation. Success then removes retained tables.
15. Refreshes system, Board, and Delegate lists after activation. External WCA
    API failures are reported but do not fail an activated ranking generation.

The detailed identity, locking, retry, and recovery contracts are documented in
[`deployment-pipeline.md`](deployment-pipeline.md).

The deployment server needs the Compose file, Caddyfile, and `.env`, but does not
need a checkout of the application source. Deployments and the refresh workflow
are the only supported production raw/projection update paths. The app entrypoint
only starts the server, so a fresh host should be imported through GitHub Actions
before it is considered ready for ranking traffic.

### Production projection-transfer benchmark

The first complete production publication through this workflow ran on
2026-07-29 against the `2026-07-29T00:00:23Z` WCA generation:

| Phase | Time |
| --- | ---: |
| Cold Actions build and index-free dump | 42m 27s |
| Upload, bulk import, index rebuild, validation, and atomic publication | 6m 47s |
| Entire deployment job | 53m 40s |
| Compressed transfer artifact | 432,325,262 bytes |

The cold artifact was saved to the Actions cache. A subsequent successful
cache-hit deployment skipped generation and completed the entire deployment job
in 10m 34s. Its transfer and publication phase took 7m 03s. About 4m 04s was
bulk transfer before index construction, and the 22 deferred indexes took about
2m 51s in total. Five `result_entries_single` indexes dominated index time at
125.6s; every other table's indexes together took about 45s.

The cache is therefore the main steady-state optimization. The five
`result_entries_single` secondary indexes had no runtime readers. They were
removed after this benchmark, eliminating the 125-second deferred-index phase.
The table and its unused count table are now retired entirely.

The first cold run without those indexes built and dumped the generation in
24m 15s, 42.9% faster than the 42m 27s indexed run. Production transfer and
publication took 5m 08s, 27.2% faster than the 7m 03s cache-hit indexed run.
Deferred-index construction fell from 22 indexes and about 171 seconds to 17
indexes and about 43 seconds. The compressed artifact remained approximately
432.3 MB because secondary indexes were already omitted from the logical dump;
the improvement comes from avoiding their initial and production construction.

Daily group builds defer leaf secondary indexes and package their exact desired
definitions in transfer metadata. Production constructs those indexes once,
after bulk loading. Builder-side `result_facts` indexes remain because downstream
groups depend on them. Benchmark builds retain all indexes and run before
packaging so request measurements reflect the production schema.

The result-level single projection is paged with the same keyset pattern. Do not
query or offset-scan the raw `results` table for the top-results page:

```sql
SELECT result_id, attempt_number, world_rank, person_id, result_value,
       competition_id
FROM result_rankings_single
WHERE event_id = '333' AND world_position > 5000
ORDER BY world_position
LIMIT 50;
```

For a short slow-query observation, enable the MariaDB global log, inspect it
using the host's normal log-access procedure, then disable it again. Ensure the
configured log path has space and do not commit log contents.

```sql
SET GLOBAL slow_query_log = 1;
SET GLOBAL long_query_time = 0.2;
SHOW GLOBAL STATUS LIKE 'Slow_queries';
SET GLOBAL slow_query_log = 0;
```

Restore the previous `long_query_time` if it was changed.

The GitHub Actions workflow expects these repository secrets:

- `SERVER_IP`: SSH address for the deployment host.
- `SERVER_HOST`: public HTTPS hostname used for the post-deploy check.
- `DEPLOY_SSH_KEY`: private key for the deployment account.
- `DEPLOY_KNOWN_HOSTS`: SSH host verification entries.

The workflow builds and validates candidate projections in GitHub Actions before
replacing the app container. A transfer or validation failure leaves the live
projection tables and application traffic unchanged. The previous image remains
available for the next rollback after health checks succeed. MariaDB, the export cache, Caddy
certificates, and their data survive because they are stored in named Docker
volumes. Deployments use images verified by the matching pull request and fail
closed when any required source-tree image is unavailable.
