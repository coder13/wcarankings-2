import assert from "node:assert/strict";
import test from "node:test";
import { parseListMemberIds } from "@/lib/list-member-ids";

test("parses single-column CSV, TSV, and common WCA ID delimiters", () => {
  assert.deepEqual(
    parseListMemberIds("2016DAVI02, 2017KIRK01\t2015YANG02\n2016HOOV01; 2016DAVI02|2017KIRK01"),
    ["2016DAVI02", "2017KIRK01", "2015YANG02", "2016HOOV01", "2016DAVI02", "2017KIRK01"],
  );
});
