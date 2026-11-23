// Prueba sintética de una página. No envía documentos del cliente ni imprime claves.
// node --env-file=.env scripts/verificar-lector-ocr.mjs
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { markdownWithInlineTables } from "../src/lib/lector-ia/ocr-tables.ts";
import { selectDocumentContext } from "../src/lib/lector-ia/retrieval.ts";

const key = process.env.MISTRAL_API_KEY?.trim();
if (!key) throw new Error("Falta MISTRAL_API_KEY");
const model = process.env.MISTRAL_OCR_MODEL || "mistral-ocr-4-1";
const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const catalog = await fetch("https://api.mistral.ai/v1/models", {
  headers, signal: AbortSignal.timeout(30_000),
});
console.log(JSON.stringify({ step: "authentication", status: catalog.status }));
if (!catalog.ok) process.exit(1);
const models = await catalog.json();
console.log(JSON.stringify({ step: "ocr_models", models: (models.data ?? []).filter((m) => /ocr/i.test(m.id)).map((m) => m.id), configured: model }));

const pdf = new jsPDF();
pdf.text(["CAVALA - DOCUMENTO DE PRUEBA", "Contrato ficticio NRO 12345", "Monto: USD 1250", "Vencimiento: 30/11/2026"], 20, 30);
autoTable(pdf, {
  startY: 65,
  head: [["Codigo", "Debilidad ficticia"]],
  body: [
    ["W1", "Primera debilidad de prueba"],
    ["W7", "Dependencia de un proveedor de pruebas"],
  ],
});
const response = await fetch("https://api.mistral.ai/v1/ocr", {
  method: "POST", headers,
  body: JSON.stringify({
    model,
    document: { type: "document_url", document_url: `data:application/pdf;base64,${Buffer.from(pdf.output("arraybuffer")).toString("base64")}` },
    table_format: null,
    include_blocks: true,
    confidence_scores_granularity: "block",
  }),
  signal: AbortSignal.timeout(60_000),
});
console.log(JSON.stringify({ step: "ocr", status: response.status }));
const result = await response.json();
if (!response.ok) {
  const detail = Array.isArray(result.detail) ? result.detail.map(({ loc, msg }) => ({ loc, msg })) : result.message ?? result.error?.message;
  console.log(JSON.stringify({ code: result.code ?? result.error?.code ?? null, detail }).replaceAll(key, "[REDACTED]"));
  process.exit(1);
}
const pages = (result.pages ?? []).map((page, index) => ({
  page: index + 1, markdown: markdownWithInlineTables(page), confidence: null,
}));
const text = pages.map((page) => page.markdown).join("\n");
const context = selectDocumentContext([{
  id: "test", name: "foda-ficticio.pdf", mime: "application/pdf", provider: "mistral", model, pages,
}], "Que significa W7?", 2_500);
const passed = ["12345", "1250", "30/11/2026"].every((expected) => text.includes(expected))
  && /W7/i.test(context) && /Dependencia de un proveedor de pruebas/i.test(context)
  && !/tbl-\d+\.md/.test(context);
console.log(JSON.stringify({ model: result.model, pages: result.pages?.length, passed, text, context }));
if (!passed) process.exit(1);
