# Deployment scripts

`projection-release.sh` deploys one immutable projection release.

The script has these phases:

1. Validate the release coordinate.
2. Transfer and verify release artifacts.
3. Prepare the candidate database generation.
4. Activate the generation and run smoke checks.
5. Refresh system lists and remove temporary deployment files.
