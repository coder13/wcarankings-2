# Deployment scripts

`projection-release.sh` deploys one immutable projection release.

TypeScript plans and validates the release coordinate. Bash transfers files and
runs remote commands.

Projection scripts are grouped by job:

- `scripts/lib/` contains shared script helpers.
- `scripts/projections/planning/` selects and validates release work.
- `scripts/projections/release/` creates and verifies release artifacts.
- `scripts/projections/build/` creates projection tables.
- `scripts/projections/transfer/` moves projection tables between databases.
- `scripts/projections/generation/` changes the active ranking generation.
- `scripts/projections/verification/` checks the completed projection tables.

`remote/projection-release.sh` is the one remote entry point. It dispatches
these phases:

1. Validate the release coordinate.
2. Transfer and verify release artifacts.
3. Prepare the candidate database generation.
4. Activate the generation and run smoke checks.
5. Refresh system lists and remove temporary deployment files.

The phase implementations live in `remote/phases/`. They are not invoked by
the GitHub workflow directly.
