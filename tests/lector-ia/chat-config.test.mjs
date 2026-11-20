import assert from "node:assert/strict";
import test from "node:test";
import { groqChatBody, lectorRequestMessages } from "../../src/lib/lector-ia/chat-config.ts";
import { lectorProviderError } from "../../src/lib/lector-ia/provider-errors.ts";

test("un saludo sin adjuntos llega como conversación, sin avisos de documentos faltantes", () => {
  for (const mode of ["standard", "expert"]) {
    const messages = lectorRequestMessages([], "", "hola", "", [], mode);
    assert.deepEqual(messages.at(-1), { role: "user", content: "hola" });
  }
});

test("preserva la evidencia y el historial cuando sí existen", () => {
  const history = [{ id: "1", role: "user", content: "Revisa el contrato" }];
  const messages = lectorRequestMessages(history, "Monto: USD 1250", "¿Por cuánto?", "Resultado de prueba", [{ title: "Fuente", url: "https://example.com" }], "standard");
  assert.equal(messages[1].content, history[0].content);
  assert.match(messages.at(-1).content, /Monto: USD 1250/);
  assert.match(messages.at(-1).content, /\[Web 1\] Fuente/);
  assert.ok(messages.at(-1).content.endsWith("¿Por cuánto?"));
});

test("el cuerpo enviado a Groq cabe en el límite OTPM de producción", () => {
  const messages = lectorRequestMessages([], "", "hola", "", [], "standard");
  const body = groqChatBody("qwen/qwen3.8-27b", messages);
  assert.ok(body.max_completion_tokens > 0 && body.max_completion_tokens < 1_000);
  assert.equal(body.reasoning_effort, "none");
  assert.equal(body.stream, true);
});

test("el 429 del proveedor conserva su espera y no se convierte en 502", () => {
  const result = lectorProviderError([{ status: 429, retryAfter: "12" }]);
  assert.equal(result.status, 429);
  assert.equal(result.headers["Retry-After"], "12");
  assert.match(result.error, /límite temporal/);
});

test("Retry-After inválido usa una espera válida", () => {
  assert.equal(lectorProviderError([{ status: 429, retryAfter: "invalid" }]).headers["Retry-After"], "60");
});

test("los fallos por espera y otros fallos tienen mensajes distintos", () => {
  assert.equal(lectorProviderError([{ timeout: true }]).status, 504);
  assert.equal(lectorProviderError([{ status: 504 }]).status, 504);
  assert.equal(lectorProviderError([{ status: 401 }]).status, 502);
  assert.equal(lectorProviderError([{ status: 429 }, { status: 500 }]).status, 502);
});
