# Projection pipeline

This directory contains the code that builds and deploys database projections.
The files in `scripts/projections/` are command-line entry points. Each entry
point has one `main` function. The work lives in the domain helpers in this
directory.

## Execution flow

```text
projection catalog
    |
    v
semantic plan -> release plan -> shared build batch -> build plan -> database build
                                                            |
                                                            v
release coordinate <- release manifest <- export <- prepare transfer tables
        |
        v
deployment plan -> import -> prepare indexes -> publish candidate -> activate
                                                                  |
                                                                  v
                                                               verify
```

The arrows show data flow. A planning function returns data. It does not run
the work in its plan.

## Directory map

```text
data-tools/
├── projection-catalog/  projection definitions, groups, and table ownership
└── projections/
    ├── artifacts/       group manifests and the final release coordinate
    ├── build/           build planning, database execution, and progress
    ├── deployment/      deployment planning and generation activation
    ├── release/         fingerprints and release planning
    ├── shared/          database types and shared database operations
    ├── transfer/        transfer preparation, export, import, and publication
    └── verification/    candidate database inspection
```

Each domain exports named input and result types. The command-line scripts
import these domain functions directly.

## Planning stages

| Stage           | Function                      | Input                                                                              | Return value                                                                                                          | Command output           |
| --------------- | ----------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Semantic plan   | `projectionSemanticPlan`      | Active generation state, selected groups, force flag, repository root              | `ProjectionSemanticPlan` with current semantic fingerprints, changed roots, downstream changed groups, and `required` | Formatted JSON on stdout |
| Release plan    | `projectionReleasePlan`       | Export identity, active generation state, selected groups, and available artifacts | `ProjectionReleasePlan` with active, cached, hydrate, build, and release groups                                       | Formatted JSON on stdout |
| Shared build batch | `Build Projection Groups` workflow | All groups that need SQL execution and groups already restored                 | One MariaDB database build with separate group artifacts                                                                  | GitHub Actions summary   |
| Build plan      | `projectionBuildPlan`         | Groups to build and groups that are already restored                              | `ProjectionBuildPlan` with projection names, satisfied dependencies, table ownership, and the ranking-table flag      | Formatted JSON on stdout |
| Task plan       | `createProjectionTaskPlan`    | Projection tasks and task names that are already satisfied                         | `ProjectionTaskPlan` with dependency-ordered tasks after it validates task names, dependencies, and cycles            | None                     |
| Deployment plan | `planProjectionDeployment`    | Immutable environment values and the downloaded release directory                  | `ProjectionDeploymentPlan` with `hasRaw`, `normalizedBuildExport`, and `normalizedProductionExport`                   | JSON on stdout           |

The semantic planner answers one question: which projection definitions changed?
It hashes the SQL and result migrations for each group. It then includes all
downstream groups that depend on a changed group.

The release planner answers a different question: how can this exact release be
produced? It combines semantic changes, the WCA export identity, active
fingerprints, and cached artifact fingerprints. Its result divides work into
five lists:

- `activeGroups`: already active with the exact fingerprint.
- `cachedGroups`: available as exact immutable artifacts.
- `hydrateGroups`: cached dependencies needed by a new build.
- `buildGroups`: groups that need SQL execution.
- `releaseGroups`: groups included in the final release.

The deployment planner runs after the release artifact is downloaded. It does
not decide what to build. It makes sure that the artifact identity, checksum,
group set, export identity, source commit, server compatibility, and raw
requirement match. It returns the small execution plan used by
`deploy/projection-release.sh`.

The task planner is internal to one database build. It returns executable tasks
and the names that are already satisfied. It does not open a database
connection, run SQL, or print output. The builder consumes this plan.

## Build stages

| Stage                     | Helper                              | Database effect                                                                                                    | Return value                                                                                 |
| ------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Execute task plan         | `executeProjectionTaskPlan`         | Runs planned tasks with bounded concurrency                                                                        | `ProjectionTaskExecutionResult[]` with each task name and result                             |
| Build projection tables   | `buildProjectionTables`             | Plans and creates the selected projection tables                                                                   | `Promise<void>`. The build writes `[projection-build]` progress messages to stdout.          |
| Prepare transfer          | `prepareProjectionTransfer`         | Renames owned tables with a `_transfer` suffix, records secondary indexes, and removes those indexes for transport | `PrepareProjectionTransferResult`                                                            |
| Export transfer           | `exportProjectionTransfer`          | None                                                                                                               | `ExportProjectionTransferResult`. The helper also writes the archive and its metadata.       |
| Create release manifest   | `createProjectionReleaseManifest`   | None                                                                                                               | `CreateProjectionReleaseManifestResult`. The helper also writes `projection-release.json`.   |
| Create release coordinate | `createProjectionReleaseCoordinate` | None                                                                                                               | `CreateProjectionReleaseCoordinateResult`. The helper also writes `projection-release.json`. |

`data-tools/projection-catalog/registry.ts` is the only job registry.
`data-tools/projection-catalog/groups.ts` owns release groups and dependencies.
`data-tools/projection-catalog/tables.ts` owns the published table lists.

`build/plan.ts` owns dependency validation. `build/builder.ts` owns database
connections, task readiness, concurrency, execution, and worker cleanup. These
two files contain all build control.

## Deployment stages

| Stage              | Helper                      | Database effect                                                                                                      | Return value                                                             |
| ------------------ | --------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Import             | `importProjectionTransfer`  | Creates transfer tables and loads their rows into the candidate schema                                               | `ImportProjectionTransferResult`                                         |
| Prepare or publish | `publishProjectionTransfer` | Builds deferred indexes. It then hydrates dependencies, prepares a candidate generation, or publishes staging tables | `PublishProjectionTransferResult`                                        |
| Activate           | `activateGeneration`        | Atomically swaps candidate tables into the production schema                                                         | `ActivateGenerationResult`                                               |
| Roll back          | `rollbackGeneration`        | Atomically restores the prior generation                                                                             | `RollbackGenerationResult`                                               |
| Inspect            | `inspectRankingProjections` | None                                                                                                                 | `ProjectionVerificationResult` with `ready`, `issues`, and table results |

Generation deployment is split into these domains:

- `deployment/generation/catalog.ts`: table ownership and capabilities.
- `deployment/generation/state.ts`: state merge and identity comparison.
- `deployment/generation/database.ts`: schema names, locks, and state reads.
- `deployment/generation/activate.ts`: bootstrap, activation, and rollback.
- `deployment/generation/manifest.ts`: input parsing for release manifests.

## Command output rules

Planning commands print one JSON object to stdout. This lets workflows redirect
stdout to a file and read fields with `jq`.

Build and transfer progress goes to stderr when the caller supplies a logger.
The final transfer result goes to stdout as JSON. The dump chunker is the one
exception: stdout is its transformed SQL stream, so it cannot print JSON.

Helpers return typed values. They do not call `process.exit`. Command-line entry
points own flag parsing, stdout, stderr, and exit codes.

Tests import the domain helpers directly. The command-line entry points do not
export domain functions.
