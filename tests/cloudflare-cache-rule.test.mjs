import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("keeps Cloudflare eligibility limited to public GET API resources", async () => {
  const rule = JSON.parse(
    await readFile(new URL("ops/cloudflare-cache-rule.json", root), "utf8"),
  );

  assert.equal(rule.ref, "wcarankings_public_api_cache");
  assert.equal(rule.action, "set_cache_settings");
  assert.match(rule.expression, /http\.request\.method eq "GET"/);
  assert.match(rule.expression, /"\/api\/rankings"/);
  assert.match(rule.expression, /"\/api\/regions"/);
  assert.match(rule.expression, /"\/api\/people\/search"/);
  assert.match(rule.expression, /"\/api\/lists"/);
  assert.doesNotMatch(rule.expression, /auth|admin|health/i);
  assert.equal(rule.action_parameters.cache, true);
  assert.equal(rule.action_parameters.edge_ttl.mode, "respect_origin");
  assert.equal(rule.action_parameters.browser_ttl.mode, "respect_origin");
  assert.equal(rule.action_parameters.cache_key.ignore_query_strings_order, true);
});

test("synchronizer creates or updates only the managed Cloudflare cache rule", async () => {
  const source = await readFile(
    new URL("scripts/sync-cloudflare-cache-rule.mjs", root),
    "utf8",
  );

  assert.match(source, /http_request_cache_settings/);
  assert.match(source, /candidate\.ref === rule\.ref/);
  assert.match(source, /cloudflare-cache-rule\.json/);
  assert.match(source, /rulesets\/phases\/\$\{phase\}\/entrypoint/);
  assert.match(source, /method: "PATCH"/);
  assert.match(source, /method: "POST"/);
  assert.match(source, /CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID are required/);
});
