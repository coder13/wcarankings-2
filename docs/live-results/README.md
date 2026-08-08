# Live results

The live-results system imports provisional results during an active
competition. The official WCA export remains the source of record.

Use these documents:

- [Import process](import-process.md) describes discovery, polling, storage,
  and projection jobs.
- [WCA Integrated Live Results](ilr.md) describes the ILR reader.
- [WCA Live](wca-live.md) describes the WCA Live reader.
- [Cubing China](cubing-china.md) describes the Cubing China reader.

## Source selection

The poller reads the current active competitions from `competitions`. A
competition is active when the current UTC date is within its start and end
date range. Cancelled competitions are not active.

The poller then reads WCA competition metadata and selects one source.

| WCA scoretaking software | Competition country | Source         | Remote ID          |
| ------------------------ | ------------------- | -------------- | ------------------ |
| `wca_live`               | Any                 | `wca-live`     | WCA competition ID |
| `internal`               | Any                 | `ilr`          | WCA competition ID |
| `external`               | China (`CN`)        | `cubing-china` | Cubing China alias |
| Other or missing         | Any                 | Disabled       | WCA competition ID |

For Cubing China, the poller reads the alias from the WCA competition website.
It expects a URL such as `https://cubing.com/competition/Maoming-Open-2026`.

## Boundaries

Live imports only support competitions in the current UTC year. They write to
the provisional live-result tables. They do not change the official export
tables.

Current-year result-ranking pages merge official results with active
provisional rows. The daily official-export pipeline remains responsible for
the complete authoritative rebuild.
