# Background worker

The Vinext app does not run long background jobs. It reads stored feed data and
sends a `feed.generate` job to the private background worker when its snapshot
is missing.

The worker checks for a feed snapshot when it starts and once per minute. The
snapshot is keyed by the current WCA export version. A new daily export creates
a new snapshot; the worker does not rebuild the same export more than once.

The worker also runs the dynamic list ranking job loop. Its HTTP server listens
only on the private container network. Compose does not publish its port to the
host or the public proxy.

The worker endpoint is `POST /jobs` with `{ "type": "feed.generate" }`. It has
no application authentication because it is not reachable from public routes.
