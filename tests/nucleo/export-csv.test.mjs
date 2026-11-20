import assert from "node:assert/strict";
import { test } from "node:test";
import { celdaCsv } from "../../src/lib/export/tabla.ts";

test("un texto que Excel ejecutaría como fórmula sale como texto", () => {
  assert.equal(celdaCsv('=HYPERLINK("https://x.test","clic")'), `"'=HYPERLINK(""https://x.test"",""clic"")"`);
  assert.equal(celdaCsv("+51 999 888 777"), "'+51 999 888 777");
  assert.equal(celdaCsv("-cmd|' /C calc'!A0"), "'-cmd|' /C calc'!A0");
  assert.equal(celdaCsv("@SUM(A1:A2)"), "'@SUM(A1:A2)");
  assert.equal(celdaCsv("\t=1+1"), "'\t=1+1");
});

test("números y textos normales no cambian", () => {
  assert.equal(celdaCsv(-12.5), "-12,5");
  assert.equal(celdaCsv("-12,5"), "-12,5");
  assert.equal(celdaCsv("+51"), "+51");
  assert.equal(celdaCsv("Partida 1234"), "Partida 1234");
  assert.equal(celdaCsv("Casa; jardín"), '"Casa; jardín"');
  assert.equal(celdaCsv(null), "");
});
