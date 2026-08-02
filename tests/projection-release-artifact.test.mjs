import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createProjectionReleaseManifest,
  verifyProjectionReleaseManifest,
} from "../scripts/projection-release-artifact.mjs";

async function fixture({ raw = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "projection-artifact-"));
  const tables = [
    "ranking_entries_single_transfer", "ranking_entries_average_transfer",
    "weekly_rank_deltas_single_transfer", "weekly_rank_deltas_average_transfer",
    "record_streaks_single_transfer", "record_streaks_average_transfer",
    "ranking_counts_transfer", "result_entries_single_transfer", "result_counts_transfer",
    "projection_transfer_manifest_compatibility", "projection_transfer_indexes_compatibility",
  ];
  await writeFile(join(directory, "compatibility-projection-transfer.sql.gz"), "archive");
  await writeFile(join(directory, "compatibility-projection-transfer.json"), JSON.stringify({
    group: "compatibility",
    exportDate: "2026-07-30 00:00:23 UTC",
    tables,
  }));
  if (raw) await writeFile(join(directory, "wca-export.sql.zip"), "raw-archive");
  const created = await createProjectionReleaseManifest({
    directory,
    exportId: "2026-07-30 00:00:23 UTC",
    exportDate: "2026-07-30",
    groups: ["compatibility"],
    fingerprints: { groups: { compatibility: {
      semanticFingerprint: "projection-semantic-compatibility-example",
      artifactFingerprint: "projection-artifact-compatibility-example",
    } } },
    sourceSha: "abc123",
    sourceTree: "def456",
    compatibility: {
      artifactFormatVersion: 3,
      datasetSchemaVersion: 1,
    },
    rawFile: raw ? "wca-export.sql.zip" : undefined,
  });
  return { directory, created };
}

test("creates and verifies checksummed projection release artifacts", async () => {
  const { directory, created } = await fixture();
  const verified = await verifyProjectionReleaseManifest({
    directory,
    expectedSha256: created.manifestSha256,
    expectedGroups: ["compatibility"],
    expectedExportId: "2026-07-30 00:00:23 UTC",
    expectedSourceSha: "abc123",
  });
  assert.equal(verified.manifest.groups.compatibility.archive.bytes, 7);
  assert.equal(verified.manifest.sourceSha, "abc123");
});

test("rejects a cached artifact whose fingerprints do not match the requested artifact", async () => {
  const { directory } = await fixture();
  await assert.rejects(
    verifyProjectionReleaseManifest({
      directory,
      expectedGroups: ["compatibility"],
      expectedFingerprints: { groups: { compatibility: {
        semanticFingerprint: "different-semantic",
        artifactFingerprint: "different-artifact",
      } } },
    }),
    /unexpected semantic fingerprint/,
  );
});

test("checksums a bundled raw export as part of the exact generation", async () => {
  const { directory, created } = await fixture({ raw: true });
  await writeFile(join(directory, "wca-export.sql.zip"), "changed");
  await assert.rejects(
    verifyProjectionReleaseManifest({
      directory,
      expectedSha256: created.manifestSha256,
    }),
    /failed verification/,
  );
});

test("rejects transfer metadata from a different WCA export", async () => {
  const directory = await mkdtemp(join(tmpdir(), "projection-artifact-"));
  await writeFile(join(directory, "compatibility-projection-transfer.sql.gz"), "archive");
  await writeFile(join(directory, "compatibility-projection-transfer.json"), JSON.stringify({
    group: "compatibility",
    exportDate: "2026-07-29 00:00:23 UTC",
    tables: [
      "ranking_entries_single_transfer", "ranking_entries_average_transfer",
      "weekly_rank_deltas_single_transfer", "weekly_rank_deltas_average_transfer",
      "record_streaks_single_transfer", "record_streaks_average_transfer",
      "ranking_counts_transfer", "result_entries_single_transfer", "result_counts_transfer",
      "projection_transfer_manifest_compatibility", "projection_transfer_indexes_compatibility",
    ],
  }));
  await assert.rejects(
    createProjectionReleaseManifest({
      directory,
      exportId: "2026-07-30 00:00:23 UTC",
      groups: ["compatibility"],
      fingerprints: { groups: { compatibility: {
        semanticFingerprint: "semantic",
        artifactFingerprint: "artifact",
      } } },
      compatibility: {
        artifactFormatVersion: 3,
        datasetSchemaVersion: 1,
      },
    }),
    /does not match/,
  );
});

test("rejects an artifact built from an unexpected source commit", async () => {
  const { directory } = await fixture();
  await assert.rejects(
    verifyProjectionReleaseManifest({
      directory,
      expectedSourceSha: "different",
    }),
    /Projection source/,
  );
});

test("rejects a projection archive changed after manifest creation", async () => {
  const { directory, created } = await fixture();
  await writeFile(join(directory, "compatibility-projection-transfer.sql.gz"), "tampered");
  await assert.rejects(
    verifyProjectionReleaseManifest({
      directory,
      expectedSha256: created.manifestSha256,
      expectedGroups: ["compatibility"],
    }),
    /failed verification/,
  );
});

test("rejects a changed release manifest", async () => {
  const { directory, created } = await fixture();
  const manifestPath = join(directory, "projection-release.json");
  await writeFile(manifestPath, `${await readFile(manifestPath, "utf8")}\n`);
  await assert.rejects(
    verifyProjectionReleaseManifest({
      directory,
      expectedSha256: created.manifestSha256,
    }),
    /manifest checksum/,
  );
});
