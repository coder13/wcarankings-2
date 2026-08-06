---
name: wca-results-export
description: Use and interpret the official World Cube Association public Results Export v2 for download automation, schema-aware analysis, result decoding, version compatibility, attribution, and safe integration with this repository. Use when a task involves the WCA export page or API, SQL or TSV export archives, export metadata, raw WCA tables, results and result_attempts, rank tables, WCA value encodings, multi-blind decoding, import readiness, or scripts/sync-wca-export.ts.
---

# WCA Results Export

Use the official public export as the source of truth, preserve its version and
date metadata, and distinguish inspecting data from importing it.

## Read first

- Read [references/export-v2.md](references/export-v2.md) before interpreting
  tables, result values, attempt rows, multi-blind values, TSV scrambles, or
  republication requirements.
- Read `scripts/lib/wca-export.ts` and `scripts/sync-wca-export.ts` before
  changing this repository's resolver or importer.
- Treat dates, archive names, sizes, URLs, API fields, and the latest minor
  version as live information. Check the official export page or public API
  instead of copying the reference snapshot into current-facing output.
- Obey `AGENTS.md`: inspect the existing local database first. Do not run an
  import, refresh, destructive SQL, or database/volume recreation without the
  user's explicit authorization for that exact operation.

## Workflow

### 1. Classify the task

Choose the smallest relevant path:

- For schema or value questions, use the bundled reference and inspect the
  archive's `README.md` or `metadata.json` when an archive is available.
- For column-level SQL, inspect the archive's `CREATE TABLE` statements or TSV
  headers. The bundled reference is a table catalog and interpretation guide,
  not a complete DDL; do not invent undocumented column names or joins.
- For latest-export checks, request the public API endpoint and compare
  `export_date` with the consumer's stored export identity.
- For flat-file analysis, use the TSV archive. For a database import, use the
  SQL archive.
- For repository work, inspect the current resolver, importer, metadata table,
  and tests before proposing changes.

### 2. Resolve and validate the export

Use `https://www.worldcubeassociation.org/api/v0/export/public` for automation.
Prefer the returned `sql_url` or `tsv_url`; these are version-stable permalinks
to the latest export within that major version.

Before processing:

1. Record the API's `export_date` and version.
2. After download, read the archive's `metadata.json` and bundled `README.md`.
3. Normalize an optional leading `v` before comparing versions.
4. Accept only a major format version the consumer explicitly supports.
5. If the major version changes, stop and audit table names, columns,
   relationships, value encodings, import behavior, and tests before proceeding.

Do not infer freshness from a cached filename alone. Do not silently treat a
missing or renamed version field as proof of compatibility; inspect the actual
payload and archive metadata.

### 3. Interpret records correctly

- Join `results.id` to `result_attempts.result_id`; attempts are no longer held
  in `results.value1` through `results.value5` in v2.
- Treat `results.best` as the best single for a round and `results.average` as
  the round average, not as individual attempts.
- Interpret `-1`, `-2`, and `0` as DNF, DNS, and no result. Interpret positive
  values according to the event's `format`.
- Use `ranks_single` and `ranks_average` for exported personal-best ranks. Use
  `results` plus `result_attempts` when the task needs round or attempt history.
- Decode time, fewest-moves, and multi-blind values with the formulas in the
  reference. Do not apply centisecond formatting to every event.
- Restore `|` to newlines only when interpreting `333mbf` scrambles from TSV.

### 4. Work safely in this repository

For a readiness check, inspect existing state without mutating it. Useful
evidence includes the `export_metadata` values, presence of required raw tables,
and the resolver/importer tests. Report exactly what is absent or stale.

Only after explicit authorization, use the repository's existing entry points
rather than inventing a parallel importer:

- `pnpm run sync:wca` for the configured environment;
- `pnpm run sync:wca:local` for the local Docker-backed flow;
- `--sql-path` or `WCA_SQL_EXPORT_PATH` for a supplied SQL archive;
- `--dry-run`, `--raw-only`, or `--force` only when their side effects match the
  authorized task.

Preserve the export identity in `export_metadata`. Keep download-to-partial and
atomic-rename behavior so interrupted downloads are not reused as complete
archives. Update focused resolver/importer tests when compatibility logic
changes.

### 5. Publish or present derived data

Carry the export date through to freshness labels and generated artifacts. If
WCA export information is republished in whole or in part, include the required
notice from the reference with the actual export date. In product UI, open any
external WCA link in a new tab.

## Verification

- Confirm the source is the public results export, not an unrelated developer
  dump.
- Confirm UTF-8 handling and the selected SQL-versus-TSV format.
- Confirm the live API identity agrees with the downloaded archive metadata.
- Confirm the supported major version before import or analysis.
- Test DNF, DNS, no-result, time, fewest-moves average, and multi-blind cases
  when changing value handling.
- Test the `results` to `result_attempts` join and attempt ordering when changing
  result queries.
- Run the narrowest relevant repository tests and `git diff --check`.
