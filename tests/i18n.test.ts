import assert from "node:assert/strict";
import test from "node:test";
import { i18n } from "@/lib/i18n";

test("uses the English catalog as the default locale", () => {
  assert.equal(i18n.language, "en");
  assert.equal(
    i18n.t("rankingsRail.pager.jumpDown", { distance: "5,000" }),
    "Down 5,000",
  );
});
