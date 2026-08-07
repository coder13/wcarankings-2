# Ranking popularity storage

The popularity service stores interest in a ranking list. It does not store ranking rows or cached result data.

## Identity

The service uses `rankingListKey` as the popularity key. The key is the SHA-256 hash of the canonical descriptor JSON.

The registry stores the descriptor family, canonical JSON, and first and last seen times. A public-list descriptor also stores its stable public list ID.

The key does not include a generation ID, result window, list membership version, title, slug, or cache time.

## Registration and recording

The caller must normalize the descriptor through the service before registration. The service rejects unsupported descriptor shapes before it writes a registry row.

For a public-list descriptor, the caller must resolve the list in request context. The caller passes the verified public list ID to registration.

The service cannot prove list visibility from a descriptor alone. A caller must not register a private list or a temporary WCA-ID collection.

After a successful first-page response, the caller can record one intentional view. The process-local buffer combines views with the same key and UTC date.

The caller can flush the buffer at a controlled time. Each flush sends one atomic additive MariaDB upsert for its combined increments.

A clear database failure restores the batch in the buffer. Records during a flush stay in the next buffer.

The buffer has a fixed entry limit. It drops a new key-date pair when full, but it continues to combine existing pairs.

## Global collection boundary

The global rankings endpoint starts collection only after it creates a successful person-event first-page response.

Collection excludes list requests, dynamic WCA-ID requests, locate requests, later pages, and composite metrics.

Collection starts in the background and does not block the ranking response.

After collection adds a view, it starts a best-effort flush when buffered views reach the entry threshold.

`RANKING_POPULARITY_FLUSH_ENTRY_THRESHOLD` specifies the threshold. The default is 100 buffered views.

A process restart can lose buffered views when the buffer has fewer views than the threshold.

The result rankings endpoint uses the same boundary for person-result descriptors. It collects only successful global first-page responses.

It excludes list requests, dynamic WCA-ID requests, locate requests, and later pages. It uses the same best-effort threshold flush.

The person activity endpoints use person-activity descriptors. The competitions endpoint includes its supported year filter. The activity endpoint records competitions, countries, rounds, or solves without a year.

The medals endpoint uses person-medals descriptors with medal type, event, year, region, and gender filters. These endpoints collect only global first pages. They exclude saved lists, dynamic WCA-ID lists, locate requests, and later pages. They use the same threshold flush and failure handling.

Competition rankings use competition descriptors for fastest, podium, competitor-count, and latitude metrics. City rankings use city descriptors for fastest, competitors, competitions, and solves metrics.

These endpoints collect only successful global first pages. They exclude list, dynamic WCA-ID, locate, and later-page requests. They use the same best-effort threshold flush and failure handling.

## Reading totals

Daily rows store successful first-page view counts. The service reads inclusive seven-day and thirty-day UTC totals.

The issue-217 score is `log2(1 + sevenDayViews) + 0.25 * log2(1 + thirtyDayViews)`.

This collection is approximate. A process restart can lose unflushed views. The additive increment is not strictly idempotent.

An ambiguous connection failure can duplicate a small count when the service retries a batch.

## Boundary with ranking data

The registry identifies a semantic ranking list. The daily table counts views of that list.

Neither table stores projection generation data, pagination data, ranking results, list memberships, or cached ranking rows. A later feed slice can join popularity totals to current ranking data.

## Reading popular descriptors

The read service returns recent descriptors with their metadata, seven-day views, thirty-day views, and issue-217 score.

It uses inclusive UTC windows. It returns descriptors with recent views in score order. Ties use seven-day views, thirty-day views, and then the descriptor key.

The service accepts a bounded limit. It does not select feeds or expose an HTTP route.
