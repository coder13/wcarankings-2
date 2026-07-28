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
streams the SQL dump into MariaDB, and then creates the indexed ranking and
result-level single tables with competition-name lookups. Result-level rows are
every positive official round single, not just each competitor's personal best.
Use `--force` to re-import an already recorded export.
For a manually downloaded archive, set `WCA_SQL_EXPORT_PATH` in the environment or
pass `--sql-path=/path/to/WCA_export.sql.zip`.

Flyway migrations and ranking projection refreshes are separate operations. To
inspect or validate app-owned migrations without importing WCA data, run
`docker compose run --rm flyway info` or `docker compose run --rm flyway validate`.
To rebuild every ranking projection from raw WCA tables already present in MariaDB,
run `docker compose run --rm app node /app/scripts/refresh-rankings.mjs`. The
deployment workflow also performs a one-time, staged result-level backfill when
`result_entries_single` is absent. It builds only that new projection from the
existing raw WCA tables, adds its `(event_id, best, id)` source index if needed,
and atomically publishes the result table and counts together. To run that
operation manually, use `docker compose run --rm app node /app/scripts/backfill-result-entries.mjs`;
add `--force` only when deliberately rebuilding that projection.

To keep the self-hosted database current, install the included systemd timer and
failure alert as root after copying the repository to the deployment directory:

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
3. Uses repository-configured SSH credentials and host verification to establish
   non-interactive access to the production host.
4. Copies `docker-compose.yml` and `ops/Caddyfile` to the deployment directory.
5. Preserves the current image as `wcarankings-app:previous`, then removes
   obsolete application and Flyway image tags while retaining images used by
   running containers and the rollback image.
6. Streams the new image directly to the server with
   `docker save | gzip | ssh ... 'gzip -d | docker load'`. There is no container
   registry involved.
7. Tags the loaded application and Flyway images, then runs `docker compose run --rm flyway migrate`.
8. Backfills a missing result-level projection from the existing raw export, then
   checks all candidate projections before switching traffic.
9. Starts the new application and proxy only after migrations and projection checks succeed.
10. Verifies the app locally on the server and through the configured public host.
11. Rolls back to `wcarankings-app:previous` if deployment health checks or
    migrations fail; otherwise removes the previous image after success.

The deployment server needs the Compose file, Caddyfile, and `.env`, but does not
need a checkout of the application source. Deployments do not download or import
WCA data. Other than a one-time backfill for a newly introduced derived table,
the daily systemd sync owns projection rebuilds. The app entrypoint only starts
the server, so a fresh host should be imported before it is considered ready for
ranking traffic.

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

The workflow runs Flyway migrations and then checks the candidate image against the
current ranking projections before replacing the app container. If the projection
check fails, it prints the projection-only rebuild command and leaves traffic on the
current app. The previous image remains available until health checks succeed. MariaDB,
the export cache, Caddy certificates, and their data survive because they are stored
in named Docker volumes. Deployments normally use images verified by the matching
pull request; when those images are unavailable, the workflow builds the merged
`main` tree before deploying it.
