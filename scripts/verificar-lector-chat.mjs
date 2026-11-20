// Uses the same prompt, request builder and SSE parser as the chat, with synthetic data.
// node --experimental-strip-types --env-file=.env --env-file=.env.local scripts/verificar-lector-chat.mjs
import assert from "node:assert/strict";
import { groqChatBody, lectorRequestMessages } from "../src/lib/lector-ia/chat-config.ts";
import { consumeProviderStream } from "../src/lib/lector-ia/stream.ts";

const key = process.env.GROQ_API_KEY?.trim();
if (!key) throw new Error("Falta GROQ_API_KEY");
const model = process.env.GROQ_CHAT_MODEL?.trim() || "qwen/qwen3.8-27b";
for (const scenario of [
  { name: "saludo", question: "hola", context: "" },
  { name: "saludo con adjunto", question: "hola", context: "--- FUENTE: ficticio.pdf | PÁGINA: 1 ---\nContrato ficticio por USD 1250." },
  { name: "consulta documental", question: "¿Cuál es el monto del contrato?", context: "--- FUENTE: ficticio.pdf | PÁGINA: 1 ---\nContrato ficticio por USD 1250." },
]) {
  const messages = lectorRequestMessages([], scenario.context, scenario.question, "", [], "standard");
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(groqChatBody(model, messages)),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`Groq HTTP ${response.status}; Retry-After: ${response.headers.get("retry-after") || "no indicado"}`);
  let text = "";
  const outcome = await consumeProviderStream(response.body, "chat", (part) => { text += part; });
  assert.equal(outcome, "complete");
  if (scenario.question === "hola") {
    assert.match(text, /hola|bienvenid|buen/i);
    assert.doesNotMatch(text, /no se adjunt|no.*evidencia|no pude responder|no fue posible|\[.*p\./i);
    assert.ok(text.length < 400);
  } else {
    assert.match(text, /1[,.]?250/);
    assert.match(text, /USD/);
    assert.match(text, /ficticio\.pdf, p\. 1/);
  }
  console.log(JSON.stringify({ scenario: scenario.name, status: response.status, passed: true, text }));
}
