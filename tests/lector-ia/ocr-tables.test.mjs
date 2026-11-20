import assert from "node:assert/strict";
import test from "node:test";
import { markdownWithInlineTables } from "../../src/lib/lector-ia/ocr-tables.ts";

const content = "| Año | Ingresos |\n| --- | --- |\n| 1 | 360000 |";
test("incluye la tabla en su lugar, con etiqueta distinta y referencia imagen", () => {
  const text = markdownWithInlineTables({ markdown: "Proyecciones\n![Tabla financiera](tbl-18.md)\nConclusión", tables: [{ id: "tbl-18.md", content }] });
  assert.equal(text, `Proyecciones\n\n\n${content}\n\n\nConclusión`);
  assert.ok(!text.includes("tbl-18.md"));
});
test("reemplaza referencias repetidas y preserva caracteres dólar", () => {
  const result = markdownWithInlineTables({ markdown: "[tbl-18.md](tbl-18.md)\n[x](tbl-18.md)", tables: [{ id: "tbl-18.md", content: "$& $100" }] });
  assert.ok(!result.includes("tbl-18.md"));
  assert.match(result, /\$& \$100/);
});
test("conserva tablas inline existentes sin duplicarlas", () => {
  assert.equal(markdownWithInlineTables({ markdown: content, tables: [{ id: "tbl-18.md", content }] }), content);
});

test("resuelve una referencia de tabla sin enlace", () => {
  const result = markdownWithInlineTables({
    markdown: "Análisis FODA\n[tbl-21.md]\nEstrategias",
    tables: [{ id: "tbl-21.md", content }],
  });
  assert.ok(!result.includes("tbl-21.md"));
  assert.ok(result.indexOf(content) < result.indexOf("Estrategias"));
});

test("conserva una tabla aunque no haya marcador en la página", () => {
  assert.equal(markdownWithInlineTables({ markdown: "Análisis FODA", tables: [{ id: "tbl-21.md", content }] }), `Análisis FODA\n\n${content}`);
});
