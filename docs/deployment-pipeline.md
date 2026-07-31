# Deployment pipeline

The production pipeline is composed from five workflow blocks:

- `plan-projections.yml` calculates exact dataset fingerprints.
- `build-server.yml` builds or resolves app, Flyway, and data-tools images.
- `build-projections.yml` creates checksummed ranking-generation bundles.
- `deploy-server.yml` deploys a compatible server release.
- `deploy-projections.yml` prepares, activates, verifies, or rolls back a ranking generation.

`deploy.yml` composes all five for a main release. `refresh-rankings.yml` resolves the
data-tools release approved by the last successful server deployment, then composes
only the projection planner, builder, and deployer.

## Labeled PR projection builds

Adding the `build-projections` label to a same-repository pull request starts
`pr-projection-release.yml`. It force-builds all projection groups from the PR
head, records the build in the Actions summary, and retains a checksummed release
artifact for 90 days. The artifact includes the raw WCA export so it remains a
coherent dataset if production advances before the merge.

When that labeled pull request is merged, the workflow finds the successful build
by the PR head SHA, downloads that exact artifact, and sends its immutable
coordinates through `deploy-projections.yml`. The deployer requires the raw
export when production has advanced, and safely reuses it when production is
still on the same export. A fork PR is intentionally ignored
because the build requires the repository's deployment credentials and executes
database-generation code.

## Identity and compatibility

These are deliberately separate:

- A group fingerprint is the exact content identity of a projection dataset. It
  includes the WCA export identity, transitive SQL dependencies, migrations, and
  generator/publisher inputs.
- `artifactFormatVersion` describes the bundle/manifest contract.
- `datasetSchemaVersion` describes the tables exposed to a server.
- A server declares the minimum and maximum dataset schema versions it supports.

The server deployment checks the active dataset schema version. It does not require
the active export or group fingerprints to equal those used by the new server.

The immutable server release identity contains the app, Flyway, and data-tools
digests plus checksums for `docker-compose.yml` and `ops/Caddyfile`. Caddy is only
recreated when either Compose or Caddy configuration changed.

## Ranking-generation activation

A deployment prepares a candidate MariaDB schema without changing active tables:

1. Import the raw WCA export into the candidate schema when the export changed.
2. Import, index, and publish selected projection bundles inside the candidate.
3. Validate the complete candidate when it contains a new raw export.
4. Stage an authoritative `ranking_generation_state` row in the candidate.
5. Execute one cross-schema `RENAME TABLE` statement.

That single rename activates new raw tables, `export_metadata`, changed projection
tables, and `ranking_generation_state`. The previous active tables move to a
retained schema in the same statement. Consequently, raw data and its exact
fingerprints cannot become visible independently.

Previous tables remain available until database checks and real HTTP ranking
queries pass. A failure swaps all previous tables back in one rename. Only a
successful smoke test permits the previous and candidate schemas to be dropped.

WCA Board and Delegate API refreshes run afterward with `continue-on-error`.
External API availability therefore cannot roll back or mark a valid ranking
generation as failed.

## Serialization

Both production orchestrators use the GitHub concurrency group
`production-mutation` with `cancel-in-progress: false`. Queued runs are not
superseded: each queued export is evaluated when it starts, and the planner may
then determine that no work remains.

Production hosts also use `/srv/wcarankings/production-mutation.lock` with `flock`.
The atomic database activation additionally uses the MariaDB advisory lock
`wcarankings-ranking-generation`. The server-side locks protect against a manually
started or otherwise non-GitHub mutation bypassing the Actions queue.

## Retry behavior

Every bundle is addressed by all of:

- originating workflow run ID;
- immutable artifact ID;
- artifact name;
- manifest SHA-256;
- approved source SHA.

The deployer verifies those coordinates with the GitHub API before downloading the
bundle. Re-running a failed deploy job therefore consumes the exact successful
build output instead of whichever artifact happens to share a name.

The host records preparation phases by artifact ID:

- `initialized`
- `raw_prepared`
- `projections_prepared`
- `activated`

A retry skips completed preparation. If activation or smoke verification fails,
rollback returns the new tables to the candidate schema and resets the phase to
`projections_prepared`, so retry starts at activation. A process crash after the
atomic rename is recoverable because the active database state contains the
artifact ID and activation receipt.

## Incrementality claim

Planning and artifact caching are fingerprint-selective: unchanged groups do not
need a new bundle, and a retry can reuse a bundle cache. The current generator may
still rebuild shared prerequisites while producing one changed group. This design
does **not** claim that table generation itself is incremental. Such a claim
requires measured timing and tests proving unaffected generation work is skipped.
