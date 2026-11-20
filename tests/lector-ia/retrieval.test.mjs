import assert from "node:assert/strict";
import test from "node:test";
import { selectDocumentContext } from "../../src/lib/lector-ia/retrieval.ts";
import { markdownWithInlineTables } from "../../src/lib/lector-ia/ocr-tables.ts";

function document(name, pages) {
  return {
    id: name,
    name,
    mime: "application/pdf",
    provider: "mistral",
    model: "test",
    pages: pages.map((markdown, index) => ({ page: index + 1, markdown, confidence: 1 })),
  };
}

test("BM25 prioriza el fragmento relacionado", () => {
  const context = selectDocumentContext([
    document("contrato.pdf", [
      "Datos generales y domicilio de las partes.",
      "La penalidad por incumplimiento asciende a S/ 12,500.",
      "Firmas y anexos.",
    ]),
  ], "¿Cuál es la penalidad?", 180);
  assert.match(context, /12,500/);
});

test("los resúmenes reparten contexto entre documentos", () => {
  const context = selectDocumentContext([
    document("uno.pdf", ["Contenido exclusivo del documento uno."]),
    document("dos.pdf", ["Contenido exclusivo del documento dos."]),
    document("tres.pdf", ["Contenido exclusivo del documento tres."]),
  ], "Resume y compara los documentos", 1_000);
  assert.match(context, /uno\.pdf/);
  assert.match(context, /dos\.pdf/);
  assert.match(context, /tres\.pdf/);
});

test("no elimina páginas parecidas con fechas o montos diferentes", () => {
  const base = "La obligación contractual será exigible conforme a las condiciones establecidas por las partes y deberá quedar registrada en el expediente.";
  const context = selectDocumentContext([
    document("fechas.pdf", [`${base} Fecha 01/01/2026. Monto S/ 10,000.`, `${base} Fecha 01/02/2026. Monto S/ 15,000.`]),
  ], "Compara las fechas y montos", 2_000);
  assert.match(context, /01\/01\/2026/);
  assert.match(context, /01\/02\/2026/);
});

test("un resumen financiero conserva cifras relevantes antes que páginas generales", () => {
  const pages = Array.from({ length: 20 }, (_, index) =>
    `Sección ${index + 1}. Información general sobre operaciones y organización. ${"Descripción de procesos. ".repeat(20)}`);
  pages[10] = "Proyección financiera: inversión inicial USD 80,000. EBITDA proyectado USD 42,000. ROI 25%.";
  const context = selectDocumentContext([document("informe.pdf", pages)],
    "Resume el documento y detalla inversión, ROI y EBITDA proyectado", 1_200);
  assert.match(context, /80,000/);
  assert.match(context, /42,000/);
});

test("una consulta por W7 recibe la fila de la tabla OCR y su página", () => {
  // Datos ficticios: no representan la definición de W7 del PDF del usuario.
  const definition = "Dependencia de un único proveedor de pruebas.";
  const pages = Array.from({ length: 20 }, (_, index) => `Sección ${index + 1}. Información general.`);
  pages[17] = markdownWithInlineTables({
    markdown: "Análisis FODA\n[tbl-21.md](tbl-21.md)\nEstrategia WT",
    tables: [{ id: "tbl-21.md", content: `| Código | Debilidad |\n| --- | --- |\n| W7 | ${definition} |` }],
  });
  const context = selectDocumentContext([document("anexo-ficticio.pdf", pages)], "¿Qué significa W7?", 500);
  assert.ok(context.includes(`| W7 | ${definition} |`));
  assert.match(context, /PÁGINA: 18/);
  assert.ok(!context.includes("tbl-21.md"));
});

test("las tablas extensas conservan el encabezado y la definición completa junto al código", () => {
  const header = "| Código | Debilidad |";
  const fillerRows = Array.from({ length: 3 }, (_, index) => `| W${index + 1} | ${"Descripción de prueba. ".repeat(33)} |`);
  const definition = `${"Detalle de la debilidad sintética. ".repeat(20)}Fin de la definición de prueba.`;
  const row = `| W7 | ${definition} |`;
  const table = [header, "| --- | --- |", ...fillerRows, row, "| W8 | Otra debilidad. |"].join("\n");
  const context = selectDocumentContext([document("tabla-ficticia.pdf", [table])], "¿Qué es W7?", 2_500);
  assert.ok(context.includes(header));
  assert.ok(context.includes(row), "La fila debe llegar completa al modelo");
});

test("una fila excepcionalmente grande no desborda el presupuesto de contexto", () => {
  const table = `| Código | Debilidad |\n| --- | --- |\n| W7 | ${"Descripción extensa. ".repeat(1_000)} |`;
  const context = selectDocumentContext([document("tabla-ficticia.pdf", [table])], "¿Qué es W7?", 2_500);
  assert.match(context, /W7/);
  assert.ok(context.length <= 2_500);
});
