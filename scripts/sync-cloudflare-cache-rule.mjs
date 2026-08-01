#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const apiOrigin = "https://api.cloudflare.com/client/v4";
const phase = "http_request_cache_settings";
const token = process.env.CLOUDFLARE_API_TOKEN;
const zoneId = process.env.CLOUDFLARE_ZONE_ID;

if (!token || !zoneId) {
  throw new Error("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID are required.");
}

const rule = JSON.parse(
  await readFile(new URL("../ops/cloudflare-cache-rule.json", import.meta.url), "utf8"),
);

async function request(path, init = {}) {
  const response = await fetch(`${apiOrigin}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    const details = payload?.errors?.map((error) => error.message).join("; ") ?? response.statusText;
    const error = new Error(`Cloudflare API ${response.status}: ${details}`);
    error.status = response.status;
    throw error;
  }
  return payload.result;
}

async function getEntryPoint() {
  try {
    return await request(`/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`);
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

const entryPoint = await getEntryPoint();
if (!entryPoint) {
  await request(`/zones/${zoneId}/rulesets`, {
    method: "POST",
    body: JSON.stringify({
      name: "Zone-level Cache Rules",
      description: "Managed public CubeRanks API cache eligibility.",
      kind: "zone",
      phase,
      rules: [rule],
    }),
  });
  console.log("Created the Cloudflare cache ruleset and public API cache rule.");
} else {
  const existingRule = entryPoint.rules?.find((candidate) => candidate.ref === rule.ref);
  if (existingRule) {
    await request(`/zones/${zoneId}/rulesets/${entryPoint.id}/rules/${existingRule.id}`, {
      method: "PATCH",
      body: JSON.stringify(rule),
    });
    console.log("Updated the Cloudflare public API cache rule.");
  } else {
    await request(`/zones/${zoneId}/rulesets/${entryPoint.id}/rules`, {
      method: "POST",
      body: JSON.stringify(rule),
    });
    console.log("Added the Cloudflare public API cache rule.");
  }
}
