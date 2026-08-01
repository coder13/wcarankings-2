# Cloudflare caching

The public CubeRanks APIs are edge-cacheable. Cache eligibility is configured as
source-controlled Cloudflare Cache Rules, not as a dashboard-only setting.

## Cache policy

The managed rule makes only these **GET** paths eligible for Cloudflare caching:

- `/api/rankings` and `/api/rankings/*`
- `/api/regions`
- `/api/people/search`
- `/api/lists` and `/api/lists/*`

It does not match `/api/auth/*`, `/api/admin/*`, health endpoints, mutations,
or unrelated APIs.

Eligibility does not force a response into cache. Cloudflare still follows the
origin response:

- Public rankings, regions, and public lists send `Cache-Control: public`.
- Private lists, authenticated-only responses, errors, and mutations send
  `Cache-Control: private, no-store` or `no-store`.
- A response with `Set-Cookie` is also not stored.

This means a public list may use the same route as a private one safely: the
origin decides whether that particular response is cacheable. The rule respects
both origin edge and browser TTLs and preserves all query parameters in the
cache key while treating equivalent parameter orderings as the same request.

## One-time setup

Create a scoped Cloudflare API token for the `wcarankings.com` zone with
**Cache Rules: Edit**, then add these GitHub repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ZONE_ID`

The [Sync Cloudflare Cache Rule](../.github/workflows/cloudflare-cache.yml)
workflow runs after a cache-rule change on `main` and can also be dispatched
manually. It creates or updates only the rule identified by
`wcarankings_public_api_cache`; unrelated Cloudflare rules remain untouched.

## Verification

After the workflow succeeds, request one public ranking URL twice:

```bash
curl -sD - -o /dev/null \
  'https://wcarankings.com/api/rankings?eventId=333&paged=1&start=0'
```

The first response should be `CF-Cache-Status: MISS`; the second should be
`HIT`. `STALE`, `REVALIDATED`, and `UPDATING` are also healthy outcomes.
Private-list and auth requests must remain `BYPASS` or `DYNAMIC`.
