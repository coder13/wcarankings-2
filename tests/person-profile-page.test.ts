import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("person profile renders from a client profile request", async () => {
  const [page, loader, route] = await Promise.all([
    readFile(
      new URL("../app/person/[wcaId]/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../lib/person-profile.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/api/people/[wcaId]/profile/route.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(page, /"use client"/);
  assert.match(page, /useParams/);
  assert.match(
    page,
    /\/api\/people\/\$\{encodeURIComponent\(wcaId\)\}\/profile/,
  );
  assert.doesNotMatch(page, /generateMetadata/);
  assert.doesNotMatch(page, /loadPersonProfileHeader/);
  assert.match(loader, /STRAIGHT_JOIN result_attempts/);
  assert.match(route, /loadPersonProfileHeader/);
});
