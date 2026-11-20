import assert from "node:assert/strict";
import test from "node:test";
import { consumeProviderStream } from "../../src/lib/lector-ia/stream.ts";

function wire(events, byteSize = 1) {
  const bytes = new TextEncoder().encode(events.map((event) => `data: ${typeof event === "string" ? event : JSON.stringify(event)}`).join("\r\n\r\n"));
  return new ReadableStream({ start(controller) {
    for (let i = 0; i < bytes.length; i += byteSize) controller.enqueue(bytes.slice(i, i + byteSize));
    controller.close();
  } });
}
const delta = (text) => ({ choices: [{ delta: { content: text }, finish_reason: null }] });
const finish = (reason) => ({ choices: [{ delta: {}, finish_reason: reason }] });

test("preserva acentos y conclusión con bytes fragmentados y sin salto final", async () => {
  let text = "";
  const outcome = await consumeProviderStream(wire([delta("Conclusión: "), delta("inversión viable."), finish("stop")]), "chat", (part) => { text += part; });
  assert.equal(outcome, "complete");
  assert.equal(text, "Conclusión: inversión viable.");
});
test("length seguido de DONE no se convierte en respuesta completa", async () => {
  assert.equal(await consumeProviderStream(wire([delta("eficiencia de"), finish("length"), "[DONE]"]), "chat", () => {}), "length");
});
test("cierre de conexión sin finish_reason se considera incompleto", async () => {
  assert.equal(await consumeProviderStream(wire([delta("Conclusión"), "[DONE]"]), "chat", () => {}), "interrupted");
});
test("detecta response.incomplete de Experto", async () => {
  assert.equal(await consumeProviderStream(wire([
    { type: "response.output_text.delta", delta: "Texto parcial" },
    { type: "response.incomplete", response: { incomplete_details: { reason: "max_output_tokens" } } },
  ]), "responses", () => {}), "length");
});
test("acepta únicamente cierre completo con texto en Responses", async () => {
  const events = [{ type: "response.output_text.delta", delta: "Informe completo." }, { type: "response.completed" }];
  assert.equal(await consumeProviderStream(wire(events), "responses", () => {}), "complete");
  assert.equal(await consumeProviderStream(wire([{ type: "response.completed" }]), "responses", () => {}), "failed");
});
test("los errores SSE no desaparecen silenciosamente", async () => {
  await assert.rejects(consumeProviderStream(wire([delta("Parcial"), { error: { message: "fallo" } }]), "chat", () => {}));
});
test("cancelar detiene el lector incluso mientras espera datos", async () => {
  let cancelled = false;
  const abort = new AbortController();
  const body = new ReadableStream({ cancel() { cancelled = true; } });
  const result = consumeProviderStream(body, "chat", () => {}, abort.signal);
  abort.abort();
  await assert.rejects(result, { name: "AbortError" });
  assert.equal(cancelled, true);
});
