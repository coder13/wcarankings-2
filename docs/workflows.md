# GitHub Actions workflows

GitHub Actions does not support a workflow-level `description` field in workflow
YAML. This catalog records the purpose, trigger, and deployment role of every
workflow in `.github/workflows/`.

| Workflow | Trigger | Description |
| --- | --- | --- |
| [Deploy CubeRanks](../.github/workflows/deploy.yml) | Push to `main`; manual dispatch | Plans the release, prepares server images and projection artifacts, then deploys the server and any required ranking-generation changes to production. |
| [Pull Request Checks](../.github/workflows/pull-request.yml) | Pull request | Runs linting, tests, migration checks, image validation, disposable-database activation tests, and the visual smoke test. It publishes verified server images for same-repository pull requests. |
| [Refresh Ranking Data](../.github/workflows/refresh-rankings.yml) | Daily schedule; manual dispatch | Resolves the latest WCA export and refreshes production ranking data, reusing projection artifacts when fingerprints are unchanged. |
| [Build and Deploy Labeled PR Projections](../.github/workflows/pr-projection-release.yml) | Pull request labeled or closed | Builds explicitly requested projection artifacts for a pull request and deploys the exact merged artifact when the labeled pull request is closed successfully. |
| [Plan Ranking Projection Release](../.github/workflows/plan-projections.yml) | Reusable workflow call | Compares projection fingerprints and WCA export identity with production to determine which projection groups need to be released. |
| [Build Ranking Projection Artifacts](../.github/workflows/build-projections.yml) | Reusable workflow call | Restores cached projection groups where possible, builds missing groups with MariaDB, validates their fingerprints, and uploads a checksummed release artifact. |
| [Deploy Ranking Generation](../.github/workflows/deploy-projections.yml) | Reusable workflow call | Transfers an approved projection release to production, validates capacity and compatibility, and atomically activates the candidate ranking generation with rollback support. |
| [Build Server Images](../.github/workflows/build-server.yml) | Reusable workflow call | Reuses verified source-tree images when available; otherwise builds, publishes, and digest-verifies the application, Flyway, and data-tools images. |
| [Deploy Server Images](../.github/workflows/deploy-server.yml) | Reusable workflow call | Deploys digest-qualified server images, runs migrations and readiness/ranking smoke checks, and rolls back with diagnostics if deployment fails. |
| [Resolve Approved Data Tools](../.github/workflows/resolve-approved-data-tools.yml) | Reusable workflow call | Resolves the approved production data-tools image and source identity for data-only ranking refreshes. |
