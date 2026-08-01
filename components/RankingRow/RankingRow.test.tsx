import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { getRecordBadges } from "@/lib/wca";
import type { RankingEntry } from "../RankingsExplorer/types";
import { RankingRow } from "./RankingRow";

const entry: RankingEntry = {
  rank: 42,
  subRank: 42,
    personId: "2024WALK01",
    personName: "Cailyn Sinclair",
    countryName: "United States",
    countryIso2: "US",
    best: 1234,
    competitionId: "storybook-open",
    competitionName: "Storybook Open 2026",
    recordBadges: ["WR", "NR"],
};

test("renders a result row without exposing internal ordering", () => {
  const markup = renderToStaticMarkup(
    <RankingRow
      entry={entry}
      display={{
        eventId: "333",
        rankingType: "single",
        animationIndex: 0,
        rankIsDuplicate: true,
      }}
    />
  );
  assert.match(markup, /Cailyn Sinclair/);
  assert.match(markup, /Storybook Open 2026/);
  assert.match(markup, /World Record/);
  assert.doesNotMatch(markup, /National Record/);
  assert.match(markup, /United States/);
  assert.ok(markup.indexOf('class="countryFlag"') < markup.indexOf('class="name">Cailyn Sinclair'));
  assert.ok(markup.indexOf('class="countryFlag"') < markup.indexOf('class="wcaId">2024WALK01'));
  assert.equal((markup.match(/class="recordBadge /g) ?? []).length, 1);
  assert.match(markup, /rank--duplicate/);
  assert.match(markup, /tabindex="0"/);
  assert.match(markup, /aria-label="Rank 42: Cailyn Sinclair, 12\.34"/);
  assert.doesNotMatch(markup, /sub-rank/);
});

test("can hide an identity ID for competition ranking rows", () => {
  const markup = renderToStaticMarkup(
    <RankingRow
      entry={{ ...entry, personId: entry.competitionId, personName: entry.competitionName }}
      display={{
        eventId: "333",
        rankingType: "single",
        animationIndex: 0,
        hideIdentityId: true,
      }}
    />,
  );

  assert.match(markup, /Storybook Open 2026/);
  assert.doesNotMatch(markup, /class="wcaId"/);
});

test("makes the full row a member selection target", () => {
  const markup = renderToStaticMarkup(
    <RankingRow
      entry={entry}
      display={{ eventId: "333", rankingType: "single", animationIndex: 0 }}
      interaction={{
        selectionMode: true,
        selected: true,
        onToggleSelected: () => undefined,
      }}
    />,
  );

  assert.match(markup, /aria-pressed="true"/);
  assert.match(markup, /class="memberSelectionToggle"/);
});

test("enables the member context menu on a ranking row", () => {
  const markup = renderToStaticMarkup(
    <RankingRow
      entry={entry}
      display={{ eventId: "333", rankingType: "single", animationIndex: 0 }}
      interaction={{ onMemberContextMenu: () => undefined }}
    />,
  );

  assert.match(markup, /row--contextMenu/);
});

test("can show a venue beneath the row identity", () => {
  const markup = renderToStaticMarkup(
    <RankingRow
      entry={{ ...entry, identitySubtitle: "Polar Hotel", competitionName: "Longyearbyen" }}
      display={{
        eventId: "333",
        rankingType: "single",
        animationIndex: 0,
        hideIdentityId: true,
      }}
    />,
  );

  assert.match(markup, /<span class="name">Cailyn Sinclair<\/span><span class="wcaId">Polar Hotel<\/span>/);
  assert.match(markup, /class="competitionName" title="Longyearbyen"/);
});

test("prioritizes the strongest available record badge", () => {
  assert.deepEqual(
    getRecordBadges({
      isWorldRecord: true,
      isContinentRecord: true,
      isCountryRecord: true,
      continentId: "_Europe",
    }),
    ["WR"],
  );
  assert.deepEqual(
    getRecordBadges({
      isWorldRecord: false,
      isContinentRecord: true,
      isCountryRecord: true,
      continentId: "_Europe",
    }),
    ["ER"],
  );
  assert.deepEqual(
    getRecordBadges({
      isWorldRecord: false,
      isContinentRecord: false,
      isCountryRecord: true,
      continentId: "_Europe",
    }),
    ["NR"],
  );
});
