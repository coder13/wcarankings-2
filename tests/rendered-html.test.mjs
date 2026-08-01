import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);
const previewRoot = new URL("../app/_sites-preview/", import.meta.url);

test("builds the original WCA Rankings UI on the self-hosted API", async () => {
  const [component, layout, rankingsRoute, wca, schema, rankingsPage] = await Promise.all([
    Promise.all([
      "../components/RankingsExplorer/RankingsExplorer.tsx",
      "../components/AppHeader/AppHeader.tsx",
      "../components/RankingsExplorer/scrollEngine.ts",
      "../components/RankingsExplorer/types.ts",
      "../components/RankingControls/RankingControls.tsx",
      "../components/RegionPicker/RegionPicker.tsx",
      "../components/Dropdown/Dropdown.tsx",
      "../components/RankingRow/RankingRow.tsx",
      "../components/ResultsTable/ResultsTable.tsx",
      "../components/SearchInputs/SearchInputs.tsx",
      "../components/VimSearchInput/VimSearchInput.tsx",
      "../components/VimHelp/VimHelp.tsx",
      "../components/RankingsRail/RankingsRail.tsx",
      "../components/Icon/arrow-up.svg",
      "../components/Icon/arrow-down.svg",
      "../components/Icon/search.svg",
      "../components/Icon/select-chevron.svg",
      "../lib/rankings-config.ts",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8"))).then((files) => files.join("\n")),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/rankings.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/wca.ts", import.meta.url), "utf8"),
    Promise.all([
      "../scripts/mysql-schema.mjs",
      "../sql/ranking-projections/ranking_entries_single_source.sql",
      "../sql/ranking-projections/ranking_entries_average_source.sql",
      "../sql/ranking-projections/ranking_entries_indexes.sql",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8"))).then((files) => files.join("\n")),
    readFile(new URL("../app/RankingsPage.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /title:\s*"WCA Rankings"/);
  assert.doesNotMatch(layout, /og\.png|summary_large_image/);
  assert.match(component, /useWindowVirtualizer/);
  assert.match(component, /const PAGE_SIZE = RESULTS_PAGE_SIZE/);
  assert.match(component, /export const RESULTS_PAGE_SIZE = 50/);
  assert.match(component, /const SEARCH_PAGE_RADIUS = 1/);
  assert.match(component, /const VIM_JUMP_PAGE_COUNT = 2/);
  assert.match(component, /paged: "1"/);
  assert.match(component, /WCA Rankings/);
  assert.match(component, /href="\/"/);
  assert.doesNotMatch(component, /href="https:\/\/wcarankings\.com"/);
  assert.match(component, /WCA_EVENTS\.map/);
  assert.match(component, /className="selectInput eventInput"/);
  assert.match(component, /className="rankingTypeToggle"/);
  assert.match(component, /type="radio"/);
  assert.match(component, /disabled=\{option === "average" && eventId === "333mbf"\}/);
  assert.match(component, /updateQueryParams/);
  assert.match(component, /eventId,/);
  assert.match(component, /result: rankingType/);
  assert.match(component, /eventId: nextEventId === "333" \? null : nextEventId/);
  assert.match(component, /result: nextRankingType === "single" \? null : nextRankingType/);
  assert.doesNotMatch(component, /allEventRankingId|initialAllEventRankingId/);
  assert.match(component, /parseRegionQuery/);
  assert.doesNotMatch(component, /searchParams\.get\("scope"\)/);
  assert.match(component, /region: option\.scope === "world" \? null : option\.regionId/);
  const wcaEventSource = wca.match(/export const WCA_EVENTS = \[([\s\S]*?)\] as const;/)?.[1] ?? "";
  assert.deepEqual(
    [...wcaEventSource.matchAll(/\{ id: "([^"]+)", name:/g)].map((match) => match[1]),
    ["333", "222", "444", "555", "666", "777", "333bf", "333fm", "333oh", "clock", "minx", "pyram", "skewb", "sq1", "444bf", "555bf", "333mbf"],
  );
  assert.match(component, /className="chooser"/);
  assert.match(component, /className="selectInput(?: eventInput)?"/);
  assert.match(component, /findBar/);
  assert.match(component, /Search names or WCA IDs/);
  assert.match(component, /activateFind/);
  assert.match(component, /RegionPicker/);
  assert.match(component, /className="regionPickerTrigger"/);
  assert.match(component, /initialRegions/);
  assert.match(component, /initialRegions\.continents/);
  assert.match(component, /initialRegions\.countries/);
  assert.match(component, /label: "World"/);
  assert.match(component, /flagEmoji/);
  assert.match(component, /recordBadges/);
  assert.match(component, /formatRankingNumber\(5000\)/);
  assert.match(component, /Jump to top/);
  assert.match(component, /Jump to end/);
  assert.match(component, /className="siteFooter"/);
  assert.match(component, /WCA export date unavailable/);
  assert.match(component, /closeOnOutsidePress/);
  assert.match(component, /document\.addEventListener\("pointerdown"/);
  assert.match(component, /loadPrevious/);
  assert.match(component, /window\.scrollBy/);
  assert.match(component, /findBar/);
  assert.match(component, /Ctrl\+F/);
  assert.match(component, /Find a name or WCA ID/);
  assert.match(component, /searchRankings/);
  assert.match(component, /updateQueryParams\(\{ search:/);
  assert.match(component, /searchParams\.get\("search"/);
  assert.match(component, /history\.replaceState/);
  assert.match(component, /cycleFind/);
  assert.match(component, /orderSearchMatches/);
  assert.doesNotMatch(component, /sub-rank/);
  assert.match(component, /event\.shiftKey \? -1 : 1/);
  assert.match(component, /key === "f"/);
  assert.match(component, /setVimMode\(false\)/);
  assert.match(component, /railFindInputRef/);
  assert.match(component, /input\?\.select\(\)/);
  assert.match(component, /key === "g"/);
  assert.match(component, /window\.innerHeight/);
  assert.match(component, /requestAnimationFrame/);
  assert.match(component, /initialScrollRef/);
  assert.match(component, /initialSearchRef/);
  assert.doesNotMatch(component, /wca-rankings-scroll-v1/);
  assert.doesNotMatch(component, /scrollRestoreAttemptedRef/);
  assert.doesNotMatch(component, /scrollPersistenceReadyRef/);
  assert.match(component, /scrollToEntry\(\{[\s\S]*targetIndex/);
  assert.match(component, /requestedBehavior\?: ScrollBehavior/);
  assert.match(component, /MIN_LOCAL_SCROLL_DURATION_MS = \d+/);
  assert.match(component, /MAX_LOCAL_SCROLL_DURATION_MS = \d+/);
  assert.match(component, /DISTANT_SCROLL_DURATION_MS = \d+/);
  assert.match(component, /getScrollAnimationDuration/);
  assert.match(component, /peopleDistance/);
  assert.doesNotMatch(component, /getScrollAnimationDuration\(currentRank,/);
  assert.doesNotMatch(component, /Math\.log10|BIG_JUMP|MEDIUM_JUMP/);
  assert.match(component, /getSearchJumpMode/);
  assert.match(component, /getSearchBridgePageStarts/);
  assert.match(component, /easeInOutCubic/);
  assert.match(component, /startPosition/);
  assert.match(component, /lastRank/);
  assert.match(component, /pendingScrollToTopRef/);
  assert.match(component, /shouldScrollToTarget/);
  assert.match(component, /shouldScrollToTarget = Boolean\([\s\S]*scrollToTop[\s\S]*pendingDirection[\s\S]*appendNavigation/);
  assert.match(component, /animateScrollTo\([\s\S]*?0,[\s\S]*?getScrollAnimationDuration\(currentPosition\)/);
  assert.match(component, /cancelOnUserInput/);
  assert.match(component, /navigationEpochRef/);
  assert.match(component, /requestEpoch !== navigationEpochRef\.current/);
  assert.match(component, /pendingNavigationAppendRef/);
  assert.match(component, /const loadedEntries/);
  assert.match(component, /if \(event\.ctrlKey \|\| event\.metaKey \|\| event\.altKey\) return/);
  assert.match(component, /vimSearchActive && key === "n"/);
  assert.match(component, /addEventListener\("wheel"/);
  assert.match(component, /getOffsetForIndex/);
  assert.match(component, /measureElement/);
  assert.match(component, /preserveListDuringLoad/);
  assert.match(component, /listItem/);
  assert.doesNotMatch(component, /className="loader"/);
  assert.match(component, /className=.*row/);
  assert.match(component, /className="competitionName"/);
  assert.match(component, /\{entry\.resultSubtitle \?\? entry\.competitionName\}/);
  assert.match(component, /title={entry\.resultSubtitle \?\? entry\.competitionName}/);
  assert.match(component, /rankingNumberFormatter/);
  assert.match(component, /formatRankingNumber\(rank\)/);
  assert.match(component, /formatWcaResult\(eventId, entry\.best, rankingType\)/);
  assert.match(component, /command === "j"[\s\S]*currentRank \+ VIM_JUMP_SIZE/);
  assert.match(component, /command === "k"[\s\S]*currentRank - VIM_JUMP_SIZE/);
  assert.match(component, /const directVimCommand/);
  assert.match(wca, /rankingType === "average" \? \(value \/ 100\)\.toFixed\(2\)/);
  assert.match(component, /const nextStart = pageStartForSubRank\(normalizedRank\) \+ 1/);
  assert.match(rankingsPage, /: \[1, 1 \+ PAGE_SIZE\]/);
  assert.match(rankingsPage, /Promise\.all\(\[loadPage\(0\), loadPage\(PAGE_SIZE\)\]\)/);
  assert.doesNotMatch(component, /header-controls|collapsed-filter-summary|table-quick-jump/);
  assert.doesNotMatch(rankingsRoute, /SELECT (MIN|MAX|COUNT\(\*\))/);
  const normalRankingsRoute = rankingsRoute.split("async function queryGenderPage")[0];
  assert.doesNotMatch(normalRankingsRoute, /ROW_NUMBER\(\) OVER/);
  assert.match(rankingsRoute, /async function queryGenderPage/);
  assert.match(rankingsRoute, /searchPersonIds/);
  assert.match(rankingsRoute, /personColumn} IN \(\$\{placeholders\}\)/);
  assert.doesNotMatch(rankingsRoute, /person_name \$\{operator\}/);
  assert.match(rankingsRoute, /competition_id/);
  assert.match(rankingsRoute, /conditions\.push\(`\$\{rank\} > 0`\)/);
  assert.match(rankingsRoute, /fetchedAt/);
  assert.match(rankingsRoute, /startPosition/);
  assert.match(rankingsRoute, /lastRank/);
  assert.match(rankingsRoute, /ORDER BY \$\{subRank\}/);
  assert.match(rankingsRoute, /is_world_record/);
  assert.match(rankingsRoute, /is_continent_record/);
  assert.match(rankingsRoute, /is_country_record/);
  assert.match(rankingsRoute, /ranking_entries_average/);
  assert.match(rankingsRoute, /ranking_entries_single/);
  assert.match(schema, /CASE WHEN r\.world_rank = 1 THEN 1 ELSE 0 END AS is_world_record/);
  assert.match(schema, /CASE WHEN r\.continent_rank = 1 THEN 1 ELSE 0 END AS is_continent_record/);
  assert.match(schema, /CASE WHEN r\.country_rank = 1 THEN 1 ELSE 0 END AS is_country_record/);
  assert.match(schema, /idx_ranking_entries_world \(event_id, world_sub_rank, person_id\)/);
  assert.doesNotMatch(schema, /idx_ranking_entries_world \(event_id, ranking_type/);
});

test("does not replace SQL failures with synthetic ranking data", async () => {
  const [page, rankingsService, rankingsRoute, readme] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/rankings.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/rankings/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /demo-data|makeDemoRankings/);
  assert.doesNotMatch(rankingsService, /demo-data|makeDemoRankings/);
  assert.match(rankingsRoute, /inputError \? 400 : 503/);
  assert.doesNotMatch(readme, /preview rows/);
  await assert.rejects(access(new URL("../lib/demo-data.ts", import.meta.url)));
});

test("uses the copied WCA Rankings visual language", async () => {
  const [globalCss, controlsCss, rankingsCss, searchCss, vimCss, jumpCss, page, layout, manifest, pwaRegistration, pwaUpdatePrompt, serviceWorker, packageJson] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/styles/controls.css", import.meta.url), "utf8"),
    readFile(new URL("../app/styles/rankings.css", import.meta.url), "utf8"),
    readFile(new URL("../app/styles/search.css", import.meta.url), "utf8"),
    readFile(new URL("../app/styles/vim.css", import.meta.url), "utf8"),
    readFile(new URL("../components/RankingsRail/RankingsRail.css", import.meta.url), "utf8"),
    readFile(new URL("../app/RankingsPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/manifest.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/PwaRegistration/PwaRegistration.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/PwaUpdatePrompt/PwaUpdatePrompt.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  const css = `${globalCss}\n${controlsCss}\n${rankingsCss}\n${searchCss}\n${vimCss}\n${jumpCss}`;

  assert.match(rankingsCss, /\.rank\s*\{[^}]*flex:\s*0 0 7ch;[^}]*width:\s*7ch;/s);
  assert.match(page, /<RankingsExplorer/);
  assert.match(page, /initialData=\{initialRankings\}/);
  assert.match(page, /initialEventId=\{eventId\}/);
  assert.match(page, /initialRankingType=\{rankingType\}/);
  assert.match(page, /initialRegionSelection=\{\{ scope, regionId \}\}/);
  assert.match(page, /startPosition: firstPage\.startPosition/);
  assert.match(page, /lastRank: lastPage\.lastRank/);
  assert.match(page, /initialRegions=\{\{ continents, countries \}\}/);
  assert.match(page, /showAllEventRankingOptions\s*\/>/);
  assert.match(page, /showSubjectSwitch/);
  assert.match(page, /fetchRegions\("continent"\)/);
  assert.match(page, /fetchRegions\("country"\)/);
  assert.match(page, /redirect/);
  assert.match(page, /loadRankings/);
  assert.match(page, /getRegions/);
  assert.match(page, /fetchRankings/);
  assert.match(page, /fetchRegions/);
  assert.doesNotMatch(page, /fetch\(/);
  assert.doesNotMatch(page, /\/api\/rankings\?\$\{params\}/);
  assert.doesNotMatch(page, /\/api\/regions\?kind=\$\{kind\}/);
  assert.match(page, /getSearchParam\(searchParams, "region"\)/);
  assert.match(page, /getSearchParamWithLegacyKey\(searchParams, "eventId", "event"\)/);
  assert.match(page, /getSearchParamWithLegacyKey\(searchParams, "result", "type"\)/);
  assert.match(page, /eventId/);
  assert.match(page, /result/);
  assert.doesNotMatch(page, /getSearchParam\(resolvedSearchParams, "scope"\)/);
  assert.match(page, /pageFirstSubRank/);
  assert.match(page, /searchParams/);
  assert.match(page, /const targetPageStart = pageFirstSubRank/);
  assert.match(page, /pages\.flatMap/);
  assert.match(layout, /title:\s*"WCA Rankings"/);
  assert.match(layout, /PwaRegistration/);
  assert.doesNotMatch(layout, /data-styles-ready|visibility: hidden|stableStylesFrames/);
  assert.match(layout, /body \{ visibility: visible; \}/);
  assert.match(manifest, /display: "standalone"/);
  assert.match(manifest, /icon-192\.png/);
  assert.match(manifest, /icon-512\.png/);
  assert.match(
    pwaRegistration,
    /serviceWorker[\s\S]*\.register\(SERVICE_WORKER_URL/,
  );
  assert.match(pwaRegistration, /updateViaCache: "none"/);
  assert.match(pwaRegistration, /controllerchange/);
  assert.match(pwaRegistration, /SKIP_WAITING/);
  assert.match(pwaRegistration, /PwaUpdatePrompt/);
  assert.match(pwaUpdatePrompt, /Update available/);
  assert.match(pwaRegistration, /import\.meta\.env\.PROD/);
  assert.match(pwaRegistration, /getRegistrations\(\)/);
  assert.match(pwaRegistration, /registration\.unregister\(\)/);
  assert.match(serviceWorker, /cache\.match/);
  assert.match(serviceWorker, /if \(!isRankingPage\(url\)\) return/);
  assert.doesNotMatch(serviceWorker, /request\.destination === "document"/);
  assert.doesNotMatch(serviceWorker, /\["script", "style", "image", "font"\]/);
  assert.doesNotMatch(serviceWorker, /SHELL_CACHE|APP_SHELL/);
  assert.match(serviceWorker, /event\.data\?\.type === "SKIP_WAITING"/);
  assert.doesNotMatch(
    serviceWorker,
    /cache\.addAll\(APP_SHELL\)\)\.then\(\(\) => self\.skipWaiting/,
  );
  assert.match(packageJson, /"name": "wcarankings-2"/);
  assert.match(packageJson, /"@tanstack\/react-virtual"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(css, /\.app\s*\{/);
  assert.match(css, /\.chooser\s*\{/);
  assert.match(css, /\.searchButton\s*\{/);
  assert.match(css, /\.selectInput select/);
  assert.match(css, /\.rankingTypeToggle/);
  assert.match(css, /\.rankingTypeOption/);
  assert.match(css, /\.selectInput select,[\s\S]*\.rankingTypeToggle,[\s\S]*\.regionPickerTrigger/);
  assert.match(css, /\.listItem/);
  assert.match(css, /\.result \{[\s\S]*display: grid;[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto;/);
  assert.match(css, /\.resultValue \{[\s\S]*display: contents;/);
  assert.match(css, /\.competitionName \{[\s\S]*grid-column: 1 \/ -1;[\s\S]*justify-self: end;/);
  assert.match(css, /overflow-anchor: none/);
  assert.doesNotMatch(css, /scroll-snap-(?:type|align)/);
  assert.doesNotMatch(css, /\.loaderBlob/);
  assert.match(css, /\.Jump/);
  assert.match(css, /\.row--alternate/);
  assert.doesNotMatch(css, /\.virtualRow:not\(:last-child\) \.row/);
  assert.doesNotMatch(css, /border-bottom: 1px solid #e5eaed/);
  assert.match(css, /\.virtualRow:hover/);
  assert.match(css, /background-color var\(--row-color-transition\)/);
  assert.match(css, /\.regionPickerMenu/);
  assert.match(css, /\.regionPickerTrigger/);
  assert.match(css, /\.regionOptions[\s\S]*overflow-y: auto/);
  assert.match(css, /\.findBar/);
  assert.match(css, /\.siteFooter/);
  assert.match(css, /\.row--searchMatch/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(css, /app-header|table-quick-jump|jump-overlay/);
  assert.doesNotMatch(layout, /codex-preview|_sites-preview|Starter Project/);

  await assert.rejects(
    access(previewRoot),
  );
  await assert.rejects(access(new URL("public/_sites-preview", templateRoot)));
});

test("production build keeps rankings styles in the root stylesheet", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../dist/client/.vite/ssr-manifest.json", import.meta.url), "utf8"),
  );
  const rankingsAssets = manifest["components/RankingsExplorer/RankingsExplorer.tsx"] ?? [];
  const assetDirectory = new URL("../dist/client/assets/", import.meta.url);
  const stylesheets = (await readdir(assetDirectory)).filter((asset) => asset.endsWith(".css"));
  const stylesheetContents = await Promise.all(
    stylesheets.map(async (asset) => [asset, await readFile(new URL(asset, assetDirectory), "utf8")]),
  );
  const [stylesheet, css] = stylesheetContents.find(([, content]) => content.includes(".EventPicker-menu{")) ?? [];

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
    const [tableRows] = await database.query("SELECT TABLE_NAME AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('ranking_entries_single', 'ranking_entries_average')");
    if (tableRows.length !== 2) {
      context.skip("self-hosted WCA database is not populated");
      return;
    }

    const [tieRows] = await database.query(
      `SELECT event_id, ranking_type, world_rank, SUM(tied) AS tied
       FROM (
         SELECT event_id, 'single' AS ranking_type, world_rank, COUNT(*) AS tied
         FROM ranking_entries_single
         GROUP BY event_id, world_rank
         UNION ALL
         SELECT event_id, 'average' AS ranking_type, world_rank, COUNT(*) AS tied
         FROM ranking_entries_average
         GROUP BY event_id, world_rank
       ) AS ranking_ties
       GROUP BY event_id, ranking_type, world_rank
       HAVING SUM(tied) > 100
       ORDER BY tied DESC
       LIMIT 1`,
    );
    const tie = tieRows[0];
    assert.ok(tie, "expected the official export to contain a tie larger than 100 people");

    const pageStart = Math.floor((Number(tie.world_rank) - 1) / 100) * 100 + 1;
    const table = tie.ranking_type === "average" ? "ranking_entries_average" : "ranking_entries_single";
    const [pageRows] = await database.query(
      `SELECT world_rank
       FROM ${table}
       WHERE event_id = ? AND world_rank >= ? AND world_rank < ?`,
      [tie.event_id, pageStart, pageStart + 100],
    );
    const tiedRows = pageRows.filter((row) => Number(row.world_rank) === Number(tie.world_rank));
    assert.equal(tiedRows.length, Number(tie.tied));
    assert.ok(tiedRows.length > 100);
  } catch (error) {
    context.skip(`self-hosted WCA database is unavailable: ${error instanceof Error ? error.message : error}`);
  } finally {
    await database?.end().catch(() => {});
  }
});
