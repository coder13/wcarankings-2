import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function read(...paths) {
  const files = await Promise.all(
    paths.map((path) => readFile(new URL(path, root), "utf8")),
  );
  return files.join("\n");
}

test("composes the rankings UI around URL state and TanStack Query", async () => {
  const [explorer, data, queries, results, url, providers] = await Promise.all([
    read(
      "components/RankingsExplorer/RankingsExplorer.tsx",
      "components/RankingsExplorer/useRankingDataRuntime.ts",
      "components/RankingsExplorer/useRankingInteractionRuntime.ts",
    ),
    read(
      "components/RankingsExplorer/useRankingWindow.ts",
      "components/RankingsExplorer/useRankingPagination.ts",
      "components/RankingsExplorer/useRankingPageLoader.ts",
      "components/RankingsExplorer/useRankingViewport.ts",
    ),
    read("components/RankingsExplorer/rankingsQueries.ts"),
    read(
      "components/RankingsExplorer/RankingsResults.tsx",
      "components/ResultsTable/ResultsTable.tsx",
    ),
    read(
      "components/RankingsExplorer/useRankingsFilters.ts",
      "components/RankingsExplorer/useRankingsUrlState.ts",
      "components/RankingsExplorer/rankingsUrl.ts",
    ),
    read("app/AppProviders.tsx", "app/layout.tsx"),
  ]);

  assert.match(explorer, /useRankingDataRuntime/);
  assert.match(explorer, /useRankingInteractionRuntime/);
  assert.doesNotMatch(explorer, /useRankingsRuntime|mockSubjectRows|mockRows/);
  assert.match(data, /query\.data\?\.pages/);
  assert.match(data, /fetchNextPage/);
  assert.match(data, /fetchPreviousPage/);
  assert.match(queries, /useInfiniteQuery/);
  assert.match(queries, /queryClient\.fetchQuery/);
  assert.match(queries, /RESULTS_PAGE_SIZE/);
  assert.match(data, /useWindowVirtualizer/);
  assert.match(results, /That’s all, folks/);
  assert.doesNotMatch(results, /className="loader"|skeleton/i);
  assert.match(url, /usePathname/);
  assert.match(url, /useSearchParams/);
  assert.match(url, /serializeRankingsUrl/);
  assert.doesNotMatch(url, /zustand|createContext|useReducer/);
  assert.match(providers, /QueryClientProvider/);
  assert.doesNotMatch(explorer + results, /sub-rank/i);
});

test("does not replace SQL failures with synthetic ranking data", async () => {
  const [page, rankings, route, readme] = await Promise.all([
    read("app/page.tsx"),
    read("lib/rankings.ts"),
    read("app/api/rankings/route.ts"),
    read("README.md"),
  ]);

  assert.doesNotMatch(page + rankings, /demo-data|makeDemoRankings/);
  assert.match(route, /inputError \? 400 : 503/);
  assert.doesNotMatch(readme, /preview rows/);
  await assert.rejects(access(new URL("lib/demo-data.ts", root)));
});

test("keeps the rankings visual shell and PWA wiring", async () => {
  const [css, page, layout, manifest, registration, updatePrompt, worker, packageJson] =
    await Promise.all([
      read(
        "app/globals.css",
        "app/styles/controls.css",
        "app/styles/rankings.css",
        "app/styles/search.css",
        "app/styles/vim.css",
        "components/RankingsRail/RankingsRail.css",
      ),
      read("app/RankingsPage.tsx"),
      read("app/layout.tsx"),
      read("app/manifest.ts"),
      read("components/PwaRegistration/PwaRegistration.tsx"),
      read("components/PwaUpdatePrompt/PwaUpdatePrompt.tsx"),
      read("public/sw.js"),
      read("package.json"),
    ]);

  assert.match(page, /<RankingsExplorer/);
  assert.match(page, /regions: \{ continents, countries \}/);
  assert.match(page, /lastResultIngestAt: rankingsMetadata\.fetchedAt/);
  assert.match(page, /showSubjectSwitch/);
  assert.match(page, /getRegions\("continent"\)/);
  assert.match(page, /getProjectionFeatureSwitch/);
  assert.match(page, /requiresResultRankings && !featureSwitch\.resultRankings/);
  assert.match(page, /requiresCompetitionRankings && !featureSwitch\.competitionRankings/);
  assert.match(layout, /title:\s*"WCA Rankings"/);
  assert.match(layout, /PwaRegistration/);
  assert.match(layout, /ProjectionFeatureSwitchProvider/);
  assert.match(manifest, /display: "standalone"/);
  assert.match(manifest, /icon-192\.png/);
  assert.match(manifest, /icon-512\.png/);
  assert.match(registration, /serviceWorker[\s\S]*\.register\(SERVICE_WORKER_URL/);
  assert.match(registration, /updateViaCache: "none"/);
  assert.match(registration, /controllerchange/);
  assert.match(registration, /SKIP_WAITING/);
  assert.match(registration, /PwaUpdatePrompt/);
  assert.match(updatePrompt, /Update available/);
  assert.match(registration, /import\.meta\.env\.PROD/);
  assert.match(registration, /getRegistrations\(\)/);
  assert.match(registration, /registration\.unregister\(\)/);
  assert.match(worker, /RANKINGS_CACHE/);
  assert.match(worker, /cache\.match/);
  assert.match(worker, /url\.pathname !== "\/api\/rankings"/);
  assert.match(worker, /event\.data\?\.type === "SKIP_WAITING"/);
  assert.doesNotMatch(
    worker,
    /cache\.addAll\(APP_SHELL\)\)\.then\(\(\) => self\.skipWaiting/,
  );
  assert.match(packageJson, /"name": "wcarankings-2"/);
  assert.match(packageJson, /"@tanstack\/react-query"/);
  assert.match(packageJson, /"@tanstack\/react-virtual"/);
  assert.doesNotMatch(packageJson, /zustand|react-loading-skeleton/);
  assert.match(css, /\.rankingTypeToggle/);
  assert.match(css, /\.regionPickerTrigger/);
  assert.match(css, /\.findBar/);
  assert.match(css, /\.listItem/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(css, /scroll-snap-(?:type|align)|\.loaderBlob/);

  await assert.rejects(access(new URL("app/_sites-preview/", root)));
  await assert.rejects(access(new URL("public/_sites-preview", root)));
});

test("production build keeps rankings styles in the root stylesheet", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("dist/client/.vite/ssr-manifest.json", root), "utf8"),
  );
  const rankingsAssets =
    manifest["components/RankingsExplorer/RankingsExplorer.tsx"] ?? [];
  const assetDirectory = new URL("dist/client/assets/", root);
  const stylesheets = (await readdir(assetDirectory)).filter((asset) =>
    asset.endsWith(".css")
  );
  const stylesheetContents = await Promise.all(
    stylesheets.map(async (asset) => [
      asset,
      await readFile(new URL(asset, assetDirectory), "utf8"),
    ]),
  );
  const [stylesheet, css] = stylesheetContents.find(([, content]) =>
    content.includes(".EventPicker-menu{")
  ) ?? [];

  assert.ok(stylesheet, "the root stylesheet must include EventPicker rules");
  assert.ok(!rankingsAssets.some((asset) => asset.endsWith(".css")));
  assert.match(css, /\.EventPicker-menu\{[\s\S]*visibility:hidden/);
  assert.match(css, /\.EventPicker-preview\{[\s\S]*width:44px/);
});

test("self-hosted ranking buckets preserve a tie larger than the page size", async (context) => {
  if (!process.env.DATABASE_URL?.startsWith("mysql://")) {
    context.skip("MySQL DATABASE_URL is not configured");
    return;
  }

  const mysql = await import("mysql2/promise");
  let database;
  try {
    database = await mysql.createConnection(process.env.DATABASE_URL);
    const [tableRows] = await database.query(
      "SELECT TABLE_NAME AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('ranking_entries_single', 'ranking_entries_average')",
    );
    if (tableRows.length !== 2) {
      context.skip("self-hosted WCA database is not populated");
      return;
    }

    const [tieRows] = await database.query(
      `SELECT event_id, ranking_type, world_rank, SUM(tied) AS tied
       FROM (
         SELECT event_id, 'single' AS ranking_type, world_rank, COUNT(*) AS tied
         FROM ranking_entries_single GROUP BY event_id, world_rank
         UNION ALL
         SELECT event_id, 'average' AS ranking_type, world_rank, COUNT(*) AS tied
         FROM ranking_entries_average GROUP BY event_id, world_rank
       ) AS ranking_ties
       GROUP BY event_id, ranking_type, world_rank
       HAVING SUM(tied) > 100
       ORDER BY tied DESC LIMIT 1`,
    );
    const tie = tieRows[0];
    assert.ok(tie, "expected the official export to contain a tie larger than 100 people");

    const pageStart = Math.floor((Number(tie.world_rank) - 1) / 100) * 100 + 1;
    const table = tie.ranking_type === "average"
      ? "ranking_entries_average"
      : "ranking_entries_single";
    const [pageRows] = await database.query(
      `SELECT world_rank FROM ${table}
       WHERE event_id = ? AND world_rank >= ? AND world_rank < ?`,
      [tie.event_id, pageStart, pageStart + 100],
    );
    const tiedRows = pageRows.filter(
      (row) => Number(row.world_rank) === Number(tie.world_rank),
    );
    assert.equal(tiedRows.length, Number(tie.tied));
    assert.ok(tiedRows.length > 100);
  } catch (error) {
    context.skip(
      `self-hosted WCA database is unavailable: ${error instanceof Error ? error.message : error}`,
    );
  } finally {
    await database?.end().catch(() => {});
  }
});
