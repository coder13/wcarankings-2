# Project UI conventions

- On mobile widths up to 759px, keep the event, ranking-type, and region controls in one row when possible.
- Those mobile controls must retain a minimum height of 40px as touch targets, even when their padding or font size changes.
- Sub-rank is an internal ordering concept and must never be shown or exposed in the user-facing UI, labels, search results, or other copy.
- Any future user-facing link to an external web page must open in a new tab.

## Local database development

- Treat the local MariaDB database and its WCA export data as persistent developer state. Never drop, recreate, import into, or rebuild its raw tables during normal development.
- Do not run ranking imports or projection refreshes merely to start or test the app. Inspect the existing database first and report what is missing.
- Only run `sync:wca`, `sync:wca:local`, `db:refresh-rankings`, schema-refresh scripts, destructive SQL, or Docker volume/database recreation after the user explicitly authorizes that exact operation.
- When local data is incomplete, prefer a clear readiness/error response and ask whether the user wants a targeted repair; state which tables or metadata would be changed before proceeding.
- For feed development, use the newer Bespin `wcarankings-sql-mariadb` pod through the documented local relay. Do not use Docker Desktop as the feed database source.

## Pre-launch compatibility

- This app has not launched. Do not preserve legacy URLs, APIs, data shapes, flags, or behavior by default.
- Before adding compatibility code, ask the user whether the change needs to be backwards compatible. Remove superseded behavior when compatibility is not explicitly requested.

## Feature details

- When the user gives a feature behavior or product detail, add a small note to the relevant file in `docs/features/`.
- Keep feature notes focused on one behavior, data rule, or local-development detail.
- Update the relevant feature note when the behavior changes.
- Feed rows must remain individually queryable. Do not replace `feed_items`
  with a single JSON snapshot row.
- Feed sorting must stay in SQL so country, continent, notability, and
  popularity rules can change at request time.
