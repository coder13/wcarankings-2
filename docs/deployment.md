# Deployment

CubeRanks is deployed as a Docker Compose stack on a managed Linux host. The
production stack contains four services:

- `db`: MariaDB 11.8 with raw WCA export data and indexed ranking projections in the `mariadb_data` named volume.
- `flyway`: the pinned Flyway migration image, which applies app-owned schema migrations before deploys and scheduled imports.
- `app`: the Node/Vinext application and WCA SQL importer. Export archives are retained in the `wca_export_cache` named volume.
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

Apply app-owned schema migrations, then run the initial WCA import from the app image:

```bash
docker compose run --rm flyway migrate
docker compose run --rm app node /app/scripts/sync-wca-export.mjs
```

The import downloads one SQL archive per export date into the persistent cache,
streams the SQL dump into MariaDB, and then builds the compatibility rankings
plus the active Sum of Ranks projection documented in
`docs/projection-architecture.md`. Other registered semantic projections are
inactive and do not extend the default import.
Use `--force` to re-import an already recorded export.
For a manually downloaded archive, set `WCA_SQL_EXPORT_PATH` in the environment or
pass `--sql-path=/path/to/WCA_export.sql.zip`.

Flyway migrations and ranking projection refreshes are separate operations. To
inspect or validate app-owned migrations without importing WCA data, run
`docker compose run --rm flyway info` or `docker compose run --rm flyway validate`.
To rebuild the compatibility and active ranking projections from raw WCA tables already present in MariaDB,
run `docker compose run --rm app node /app/scripts/refresh-rankings.mjs`. The
deployment workflow backfills missing active groups before checking readiness.
To build or replace only Sum of Ranks against the current imported export, run
`docker compose run --rm app node /app/scripts/backfill-sum-of-ranks.mjs`;
add `--force` to replace an existing Sum of Ranks generation. This targeted
operation does not import or replace raw WCA tables.

To keep the self-hosted database current, use the `Refresh Ranking Data` GitHub
Actions workflow. It runs daily at 05:17 UTC and can also be started manually
from the Actions tab. The manual run has two controls:

- `force=true` re-imports the current WCA export and rebuilds projections even
  when production already has that export date.
- `dry_run=true` downloads or verifies the latest export archive in production's
  persistent cache without importing or rebuilding projections.

The workflow runs Flyway, executes `sync-wca-export.mjs`, validates the published
ranking projections, and uses `/tmp/wcarankings-sync.lock` on the production host
so two refreshes do not run at the same time.

The included systemd timer is an optional server-local fallback. Do not enable it
alongside the scheduled GitHub workflow unless both paths use the same lock and
the additional redundant daily run is intentional. To install the fallback timer
and failure alert as root after copying the repository to the deployment
directory:

```bash
install -m 0644 ops/wcarankings-sync.service /etc/systemd/system/
install -m 0644 ops/wcarankings-sync.timer /etc/systemd/system/
install -m 0644 ops/wcarankings-sync-alert.service /etc/systemd/system/
install -m 0755 ops/wcarankings-sync-alert.sh /usr/local/bin/wcarankings-sync-alert
# Create a root-owned, mode-0700 directory for server-only notification settings.
# Store the notification environment file there with mode 0600.
systemctl daemon-reload
systemctl enable --now wcarankings-sync.timer
```

The sync service triggers the alert service on failure. Its notification destination
is configured only on the server.

## GitHub Actions deployment

`.github/workflows/deploy.yml` deploys automatically after pushes to `main`; it can
also be started with `workflow_dispatch`. Deploys are serialized so two production
deploys do not overlap.

Pull-request checks build the application and Flyway images from the checked-out
merge result and tag them with the Git tree SHA, rather than a commit SHA,
because GitHub can create a different commit SHA when a pull request is merged
while retaining the same source tree. Before publishing either image, the job
runs the Flyway image against temporary MariaDB, loads a small WCA-like fixture,
refreshes ranking projections using the application image, starts that exact
image, and runs a Chromium smoke test against it. The test asserts a seeded
ranking is visible and uploads a screenshot plus Playwright report as a
14-day workflow artifact. Only a successful same-repository pull request pushes
those already-tested image tags to GitHub Container Registry.

The deployment workflow does the following:

1. Checks out the merged commit and calculates its Git tree SHA.
2. Pulls the matching prebuilt application and Flyway images from GitHub Container Registry.
3. Reads the production database's published WCA export date, then restores
   that dated SQL archive and any matching completed projection artifact from
   GitHub Actions caches. On an archive-cache miss, Actions streams the matching
   ZIP from production's persistent export cache. Projection artifacts are
   keyed by export date and projection-schema hash.
4. On a projection-cache miss, imports the WCA archive into ephemeral MariaDB
   and builds and validates the complete generation. Secondary indexes are
   recorded and removed before the logical dump.
5. Retains the compressed SQL plus its export-date and deferred-index manifest
   as both a reusable cache entry and seven-day workflow artifact.
6. Uses repository-configured SSH credentials and host verification to establish
   non-interactive access to the production host.
7. Copies `docker-compose.yml` and `ops/Caddyfile` to the deployment directory.
8. Preserves the current image as `wcarankings-app:previous`, then removes
   obsolete application and Flyway image tags while retaining images used by
   running containers and the rollback image.
9. Streams the new image directly to the server with
   `docker save | gzip | ssh ... 'gzip -d | docker load'`. There is no container
   registry involved.
10. Tags the loaded application and Flyway images, then runs `docker compose run --rm flyway migrate`.
11. Uploads and bulk-imports transfer tables without secondary indexes beside
    the live projections. Production verifies the manifest date, builds each
    table's deferred indexes in one alter operation, then publishes the entire
    projection generation with one atomic table rename.
12. Starts the new application and proxy only after projection publication and
    readiness checks succeed.
13. Verifies readiness, SOR, Kinch, competition rankings, SSR assets, and the
    configured public host.
14. Rolls back to `wcarankings-app:previous` if deployment health checks or
    migrations fail; otherwise removes the previous image after success.

The deployment server needs the Compose file, Caddyfile, and `.env`, but does not
need a checkout of the application source. Deployments do not replace production
raw WCA tables; transferred projections are accepted only when their source
export date matches those tables. The daily systemd sync remains responsible for
updating raw production data. The app entrypoint only starts the server, so a
fresh host should be imported before it is considered ready for ranking traffic.

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
`result_entries_single` secondary indexes had no runtime readers. They were removed after this
benchmark, leaving the compatibility table's primary key and eliminating its
125-second deferred-index phase.

The first cold run without those indexes built and dumped the generation in
24m 15s, 42.9% faster than the 42m 27s indexed run. Production transfer and
publication took 5m 08s, 27.2% faster than the 7m 03s cache-hit indexed run.
Deferred-index construction fell from 22 indexes and about 171 seconds to 17
indexes and about 43 seconds. The compressed artifact remained approximately
432.3 MB because secondary indexes were already omitted from the logical dump;
the improvement comes from avoiding their initial and production construction.

The next transfer optimization target is the compatibility table's data build
and replay cost, or a physical backup/restore format that avoids row-by-row
logical replay.

## Ranking performance verification

`GET /api/health/live` checks process liveness and `GET /api/health/ready`
checks database and projection readiness. Both are `no-store`; deployment waits
for readiness before rendering the page.

Run the repeatable local traffic mix after starting the app:

```bash
npm run load:rankings
```

It covers normal browsing, distant pages, incremental search typing, and unique
queries. It defaults to localhost; a remote target requires
`--target=https://example.com --allow-remote`. Its JSON report includes request
and status counts, p50/p95 latency, cache outcomes, and Server-Timing samples.

Inspect an indexed production path without changing data (use a representative
cohort):

```sql
EXPLAIN ANALYZE SELECT world_rank, world_sub_rank, person_id
FROM ranking_entries_single
WHERE event_id = '333' AND world_rank > 0
  AND world_sub_rank >= 5001 AND world_sub_rank < 5051
ORDER BY world_sub_rank;
```

The result-level single projection is paged with the same keyset pattern. Do not
query or offset-scan the raw `results` table for the top-results page:

```sql
SELECT result_id, world_rank, person_id, person_name, best, competition_id
FROM result_entries_single
WHERE event_id = '333' AND world_sub_rank > 5000
ORDER BY world_sub_rank
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
available until health checks succeed. MariaDB, the export cache, Caddy
certificates, and their data survive because they are stored in named Docker
volumes. Deployments normally use images verified by the matching pull request;
when those images are unavailable, the workflow builds the merged `main` tree
before deploying it.
