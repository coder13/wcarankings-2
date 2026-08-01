# WCA Rankings

CubeRanks is a fast, mobile-first browser for official [World Cube Association rankings](https://www.worldcubeassociation.org/results/rankings/333/single). It supports event and result-type filters, virtualized ranking pages, large rank jumps, WCA ID lookup, and optional WCA OAuth sign-in.

The app runs as a self-hosted Node service backed by MariaDB/MySQL. The importer downloads the official WCA Results Export v2 SQL archive, loads the raw WCA tables, and builds indexed personal-best and result-level single projections with competition names for fast browsing. The result-level projection contains every positive official round single, so a competitor can appear multiple times.

## Local development

Install dependencies and create a local environment:

```bash
pnpm install
cp .env.example .env.local
```

For a local Node process, change `DATABASE_URL` in `.env.local` from the Compose hostname `db` to `127.0.0.1:13307`, then start MariaDB:

```bash
docker compose up -d db
pnpm run dev
```

Open `http://localhost:3000`. Ranking data is available after the first WCA import. Import the current export with:

```bash
pnpm run sync:wca:local
```

Google Analytics uses measurement ID `G-83F787NWS9` in production builds. It is
disabled automatically in local development and tests.

The importer compares export dates before downloading, so repeated runs are safe. Use `--force` when an explicit re-import is needed.

App-owned MariaDB schema is managed by Flyway. Run `pnpm run db:migrate` to apply
or validate pending migrations, or run `pnpm run db:refresh-rankings` to rebuild
the derived ranking projections from raw WCA tables already in MariaDB.
`pnpm run sync:wca:local` runs Flyway first, then imports the export and rebuilds
the derived projections.

Useful checks:

```bash
pnpm run build
pnpm test
pnpm run lint
pnpm run test:unit
pnpm run storybook
pnpm run build-storybook
```

Storybook runs the client-side rankings explorer with deterministic preview data
at `http://localhost:6006`, so it does not require MariaDB or a WCA export.
The main page lives in `app/page.tsx`. UI components live in `components/`;
each component folder contains its source, Storybook stories, and colocated unit
tests.

See [docs/deployment.md](docs/deployment.md) for Docker Compose setup, server
prerequisites, the GitHub Actions-owned WCA refresh flow, and deployment flow.

## WCA sign-in

Create an OAuth application in your [WCA account](https://www.worldcubeassociation.org/oauth/applications), using:

```text
https://YOUR_DOMAIN/api/auth/wca/callback
```

Set `WCA_CLIENT_ID`, `WCA_CLIENT_SECRET`, and `WCA_REDIRECT_URI` in the deployment `.env` file. The app requests only the `public` scope, persists the verified WCA identity in `app_users`, and stores a hashed, revocable session in `auth_sessions`. It does not persist the WCA access token.

For localhost development, the app defaults to WCA staging with `example-application-id` and `example-secret`; no local OAuth values are required. This fallback applies only to `NODE_ENV=development` requests to `localhost`, `127.0.0.1`, or `::1`. Production never uses the example credentials or WCA staging.

Run Flyway before enabling sign-in so the user and session tables exist.

## Repository layout

```text
app/                         React UI and API routes
db/                          MySQL connection pool
migrations/mysql/            Flyway versioned MariaDB migrations
sql/ranking-projections/     Readable SQL for daily derived ranking projections
Dockerfile.flyway             Pinned Flyway migration image
scripts/sync-wca-export.mjs  WCA SQL export downloader and importer
Dockerfile                   Multi-stage production image
docker-compose.yml           MariaDB + app services
```

See [docs/projection-architecture.md](docs/projection-architecture.md) for the
permanent projection naming, grain, dependency, metric-versioning, and atomic
publication contract.

CubeRanks is an independent community project and is not affiliated with or endorsed by the World Cube Association.
