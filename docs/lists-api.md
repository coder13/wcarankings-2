# Competitor lists API foundation

Issue [#7](https://github.com/coder13/wcarankings-2/issues/7) defines the complete product. This document describes the first backend slice.

## Authentication

WCA OAuth creates or updates an `app_users` row keyed by the verified WCA ID. The browser receives an opaque random session token. Only its SHA-256 hash is stored in `auth_sessions`, so sessions can be expired or revoked without retaining a usable cookie value.

Authenticated mutation requests use the user and WCA ID resolved from that session. They never accept a caller-supplied identity for self-removal, membership requests, or list preferences.

## User list endpoints

- `GET /api/lists` lists the signed-in user's owned lists.
- `GET /api/lists?relation=containing` lists lists containing the signed-in person.
- `POST /api/lists` creates a list.
- `GET /api/lists/{id}` reads authorized metadata.
- `PATCH /api/lists/{id}` edits an owned user list.
- `DELETE /api/lists/{id}` soft-deletes an owned user list.
- `GET /api/lists/{id}/members` reads a keyset-paginated member page.
- `POST /api/lists/{id}/members` adds up to 1,000 WCA IDs idempotently.
- `DELETE /api/lists/{id}/members/{wcaId}` removes a member as owner.
- `DELETE /api/lists/{id}/members/me` removes the signed-in person and records an exclusion.
- `GET|POST /api/lists/{id}/requests` manages the owner queue or requests self-inclusion.
- `POST /api/lists/{id}/requests/{requestId}/decision` accepts or rejects a request.
- `GET|PATCH /api/account/list-preferences` reads or changes global list inclusion.
- `GET /api/lists/{id}/rankings` returns list-relative rankings. It does not include official world, continent, or country ranks.

User-created lists use eight-character Crockford Base32 public IDs. System aliases such as `max` and `luke` resolve through the same read and ranking services but reject ordinary owner mutations.

## System lists

`pnpm run db:refresh-system-lists` rebuilds curated system memberships. The WCA importer also runs the rebuild transaction after publishing new ranking projections. A failed rebuild rolls back and leaves the prior memberships intact.

The generator uses the WCA persons export dated 2026-08-06. It creates gendered first-name lists and surname lists from primary person rows. First names use the first token in `persons.name`. Surnames use the last token before a parenthesized local name.

The first 25 male first-name lists, first 25 female first-name lists, and first 25 surname lists are public. Other generated lists have private visibility. Private visibility only removes a list from the public directory. A user can still open a private system list through its direct URL.

Name matching is exact and case-insensitive. It does not match prefixes, so `Max` matches and `Maxwell` does not.

## Still intentionally separate

The database includes durable import-job metadata, but upload storage, background job execution, rate limiting, moderation UI, list editor pages, and the full list rankings page remain later slices of issue #7.
