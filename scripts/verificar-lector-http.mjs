// End-to-end smoke test with an ephemeral account; no emails or client documents.
// TEST_BASE_URL=http://localhost:3108 node --env-file=.env --env-file=.env.local scripts/verificar-lector-http.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const base = (process.env.TEST_BASE_URL || "http://localhost:3108").replace(/\/$/, "");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
let userId;
try {
  const anonymous = await fetch(`${base}/api/lector-ia/chat`, {
    method: "POST", redirect: "manual", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: "hola" }),
  });
  assert.ok(anonymous.status === 403 || (anonymous.status === 307 && new URL(anonymous.headers.get("location"), base).pathname === "/login"), "El chat debe requerir sesión");

  const email = `lector-smoke-${randomUUID()}@example.test`;
  const password = randomUUID() + "aA1!";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  userId = data.user.id;
  const { error: profileError } = await admin.from("perfiles").update({
    rol: "soporte_documentario", activo: true, nombre: "Prueba temporal del chat", notificaciones_email: false,
  }).eq("id", userId);
  if (profileError) throw profileError;
  const { error: accessError } = await admin.from("lector_ia_accesos").insert({
    usuario_id: userId, max_consultas: 2, termina_en: new Date(Date.now() + 3_600_000).toISOString(),
  });
  if (accessError) throw accessError;

  const cookies = new Map();
  const client = createServerClient(url, anon, {
    cookies: {
      getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
      setAll: (items) => { for (const { name, value } of items) cookies.set(name, value); },
    },
  });
  const { error: loginError } = await client.auth.signInWithPassword({ email, password });
  if (loginError) throw loginError;
  const response = await fetch(`${base}/api/lector-ia/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; ") },
    body: JSON.stringify({ question: "hola", documents: [], messages: [], mode: "standard", webSearch: false }),
    signal: AbortSignal.timeout(115_000),
  });
  const raw = await response.text();
  assert.equal(response.status, 200, `Chat HTTP ${response.status}: ${raw.slice(0, 300)}`);
  const events = raw.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => JSON.parse(line.slice(5)));
  const text = events.filter((event) => event.type === "delta").map((event) => event.text).join("");
  assert.ok(events.some((event) => event.type === "done" && !event.truncated));
  assert.ok(!events.some((event) => event.type === "error"));
  assert.match(text, /hola|bienvenid|buen/i);
  assert.doesNotMatch(text, /no se adjunt|no pude responder|no fue posible/i);

  const { data: usage, error: usageError } = await client.from("lector_ia_uso").select("consultas").eq("usuario_id", userId);
  if (usageError) throw usageError;
  assert.equal(usage.reduce((sum, row) => sum + row.consultas, 0), 1, "Un saludo debe contar como una única consulta completada");
  console.log(JSON.stringify({ base, anonymous: anonymous.status, chat: response.status, completed: true, usage: 1, text }));
} finally {
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;
    console.log("Cuenta temporal de prueba eliminada.");
  }
}
