// Prueba mínima con texto ficticio; no imprime claves ni documentos del cliente.
// node --env-file=.env scripts/verificar-lector-proveedores.mjs
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { spawnSync } from "node:child_process";

if (process.argv.includes("--reutilizar-xai")) {
  const target = ".env";
  const original = readFileSync(target, "utf8");
  const local = parseEnv(original);
  if (!local.XAI_API_KEY?.trim()) {
    const source = { ...parseEnv(readFileSync("cerebro-veczail-ai-main/.env", "utf8")), ...parseEnv(readFileSync("cerebro-veczail-ai-main/.env.local", "utf8")) };
    const key = source.VITE_GROK_API_KEY?.trim();
    if (!key || !/^[a-zA-Z0-9_.-]+$/.test(key)) throw new Error("Clave xAI ausente o formato inesperado");
    const updated = /^XAI_API_KEY=/m.test(original)
      ? original.replace(/^XAI_API_KEY=.*$/m, `XAI_API_KEY=${key}`)
      : `${original.trimEnd()}\nXAI_API_KEY=${key}\n`;
    const patch = `*** Begin Patch\n*** Update File: ${target}\n@@\n${original.trimEnd().split("\n").map((line) => `-${line}`).join("\n")}\n${updated.trimEnd().split("\n").map((line) => `+${line}`).join("\n")}\n*** End Patch\n`;
    const result = spawnSync("apply_patch", [], { input: patch, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    if (result.status !== 0) throw new Error("No se pudo guardar XAI_API_KEY");
    process.env.XAI_API_KEY = key;
    console.log("XAI_API_KEY reutilizada en Cavala (valor oculto).");
  }
}

const question = "Documento ficticio: el contrato vence el 30/11/2026. Responde solamente con esa fecha.";
const providers = [
  { name: "groq", key: process.env.GROQ_API_KEY, url: "https://api.groq.com/openai/v1/chat/completions", body: {
    model: process.env.GROQ_CHAT_MODEL || "qwen/qwen3.8-27b",
    messages: [{ role: "user", content: question }], temperature: 0.1,
    max_completion_tokens: 900, reasoning_effort: "none", stream: true,
  } },
  { name: "openai", key: process.env.OPENAI_API_KEY, url: "https://api.openai.com/v1/responses", body: {
    model: process.env.OPENAI_CHAT_MODEL || "gpt-5.6-luna",
    input: question, max_output_tokens: 1200, store: false, stream: true,
  } },
  { name: "xai", key: process.env.XAI_API_KEY, url: "https://api.x.ai/v1/chat/completions", body: {
    model: process.env.XAI_CHAT_MODEL || "grok-4.3",
    messages: [{ role: "user", content: question }], temperature: 0.1,
    max_tokens: 1200, reasoning_effort: "low", stream: true,
  } },
];

const selected = process.argv.includes("--groq-only") ? providers.filter((p) => p.name === "groq") : providers;
const results = await Promise.allSettled(selected.map(async (provider) => {
  if (!provider.key?.trim()) { console.log(JSON.stringify({ provider: provider.name, configured: false })); process.exitCode = 1; return; }
  const response = await fetch(provider.url, {
    method: "POST", headers: { Authorization: `Bearer ${provider.key.trim()}`, "Content-Type": "application/json" },
    body: JSON.stringify(provider.body), signal: AbortSignal.timeout(60_000),
  });
  const raw = await response.text();
  if (!response.ok) {
    let error;
    try { const parsed = JSON.parse(raw); error = parsed.error?.message ?? parsed.message ?? parsed.detail; } catch { error = "Respuesta no JSON"; }
    console.log(JSON.stringify({ provider: provider.name, model: provider.body.model, status: response.status, error: String(error).replaceAll(provider.key, "[REDACTED]").slice(0, 400) }));
    process.exitCode = 1; return;
  }
  let text = "";
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    const event = JSON.parse(data);
    text += event.type === "response.output_text.delta" ? event.delta : event.choices?.[0]?.delta?.content ?? "";
  }
  const passed = text.includes("30/11/2026");
  console.log(JSON.stringify({ provider: provider.name, model: provider.body.model, status: response.status, passed, text: text.slice(0, 200) }));
  if (!passed) process.exitCode = 1;
}));
for (const [i, result] of results.entries()) {
  if (result.status === "rejected") {
    console.log(JSON.stringify({ provider: selected[i].name, networkError: result.reason?.cause?.code ?? result.reason?.name ?? "Error" }));
    process.exitCode = 1;
  }
}
