import assert from "node:assert/strict";
import test from "node:test";
import { limaMonthWindow } from "../../src/lib/lector-ia/month.ts";

test("el mes cambia a medianoche de Lima, no a medianoche UTC", () => {
  const before = limaMonthWindow(new Date("2026-10-01T04:59:59Z"));
  const after = limaMonthWindow(new Date("2026-10-01T05:00:00Z"));
  assert.equal(before.start.toISOString(), "2026-09-01T05:00:00.000Z");
  assert.equal(after.start.toISOString(), "2026-10-01T05:00:00.000Z");
});
