import assert from "node:assert/strict";
import test from "node:test";
import { linkedDocumentCitations, safeDecodeCitationId } from "../../src/lib/lector-ia/citations.ts";

const document = {
  id: "documento local",
  name: "Constancia de Posesión.PDF",
  mime: "application/pdf",
  provider: "mistral",
  model: "test",
  sourceUrl: "blob:test",
  pages: [{ page: 2, markdown: "Texto", confidence: 1 }],
};

test("enlaza una cita válida aunque se omita la extensión", () => {
  const result = linkedDocumentCitations("Dato [Constancia de Posesión, p. 2]", [document]);
  assert.match(result, /\/lector-ia\/cita\/documento%20local\?page=2/);
});

test("no enlaza páginas inexistentes", () => {
  const citation = "[Constancia de Posesión, p. 9]";
  assert.equal(linkedDocumentCitations(citation, [document]), citation);
});

test("una URL mal codificada no rompe el render", () => {
  assert.equal(safeDecodeCitationId("%E0%A4%A"), "");
});
