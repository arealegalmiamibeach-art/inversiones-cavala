// Auditoría local con cuenta y registros temporales; nunca modifica registros existentes.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.TEST_BASE_URL || "http://localhost:3108";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "La auditoría debe ejecutarse contra el servidor local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const creados = [];
let usuario, browser, page;
const prefijo = `Auditoría ${randomUUID().slice(0, 8)}`;
async function crear(tabla, valores) {
  const id = randomUUID();
  const { error } = await admin.from(tabla).insert({ id, ...valores, extra: { origen: "app" } });
  if (error) throw new Error(`${tabla}: ${error.message}`);
  creados.push({ tabla, id });
  return id;
}
async function esperarValor(tabla, id, campo, valor) {
  for (let intento = 0; intento < 40; intento++) {
    const { data, error } = await admin.from(tabla).select(campo).eq("id", id).single();
    if (error) throw error;
    if (data[campo] === valor) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`No persistió ${tabla}.${campo}`);
}
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
  const correo = `tablas-${randomUUID()}@example.test`, password = randomUUID() + "Aa1!";
  const { data, error } = await admin.auth.admin.createUser({ email: correo, password, email_confirm: true });
  if (error) throw error;
  usuario = data.user.id;
  const perfil = await admin.from("perfiles").update({ rol: "administrador", activo: true, nombre: prefijo, notificaciones_email: false }).eq("id", usuario);
  if (perfil.error) throw perfil.error;
  const cookies = [];
  const sesion = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: { getAll: () => cookies, setAll: (valores) => cookies.push(...valores) } });
  const login = await sesion.auth.signInWithPassword({ email: correo, password });
  if (login.error) throw login.error;
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, reducedMotion: "reduce" });
  await context.addInitScript(() => {
    if (localStorage.getItem("auditoria-preferencias")) return;
    localStorage.setItem("auditoria-preferencias", "1");
    localStorage.setItem("records-view:documentos", JSON.stringify({ order: ["nombre", "rel_propietario"], hidden: ["rel_propietario"] }));
    localStorage.setItem("records-view:contratos-mutuo", JSON.stringify({ metaColumnas: { monto: { tipo: "numero", formatoNumero: { decimales: 2, prefijo: "S/ " } }, inicio: { tipo: "fecha", formatoFecha: "iso" } } }));
  });
  await context.addCookies(cookies.map(({ name, value }) => ({ name, value, url: base, sameSite: "Lax" })));
  page = await context.newPage();
  page.setDefaultTimeout(20000);
  const errores = [];
  page.on("pageerror", (e) => errores.push(e.message));
  page.on("requestfailed", (r) => { if (r.failure()?.errorText !== "net::ERR_ABORTED") console.log(`Recurso fallido: ${new URL(r.url()).pathname} ${r.failure()?.errorText}`); });
  const propietario = await crear("propietarios", { nombre: prefijo, tipo_persona: "natural" });
  const documento = await crear("documentos", { nombre: prefijo, tipo: "copia_literal" });
  const contrato = await crear("contratos", { nombre: prefijo, tipo: "mutuo", monto: 123.45, fecha_inicio: "2040-01-01" });
  const proceso = await crear("procesos", { expediente: prefijo, materia: "civil", diligencia: "Audiencia 01/01/2040" });
  const persona = await crear("personal", { nombre: prefijo });
  const vinculo = await admin.from("vinculos").insert({ origen_tipo: "propietario", origen_id: propietario, destino_tipo: "documento", destino_id: documento, rol: null, resuelto_por: "manual" });
  if (vinculo.error) throw vinculo.error;

  async function abrirTabla(ruta) {
    console.log(`Comprobando ${ruta}`);
    await page.goto(base + ruta, { waitUntil: "networkidle", timeout: 90000 });
    await page.getByRole("textbox", { name: "Buscar registros" }).fill(prefijo);
    await page.locator("table:visible tbody tr").filter({ hasText: prefijo }).first().waitFor();
  }
  await abrirTabla("/documentos");
  assert.equal(await page.getByRole("columnheader", { name: "Relacionado con", exact: true }).count(), 0);
  const filaDoc = page.locator("table:visible tbody tr").filter({ hasText: prefijo }).first();
  assert.ok(await filaDoc.getByRole("link", { name: prefijo, exact: true }).count(), "No se ve la relación inversa existente");
  await filaDoc.getByRole("button", { name: prefijo, exact: true }).click();
  await filaDoc.getByRole("textbox", { name: "nombre", exact: true }).fill(prefijo + " editado");
  await filaDoc.getByRole("textbox", { name: "nombre", exact: true }).blur();
  await esperarValor("documentos", documento, "nombre", prefijo + " editado");
  await filaDoc.getByRole("button", { name: "Abrir vista lateral", exact: true }).click();
  assert.equal(await page.getByRole("textbox", { name: "Título", exact: true }).inputValue(), prefijo + " editado");
  await page.getByRole("textbox", { name: "Título", exact: true }).fill(prefijo + " lateral");
  await page.getByRole("textbox", { name: "Título", exact: true }).blur();
  await esperarValor("documentos", documento, "nombre", prefijo + " lateral");
  await page.goto(base + `/documentos/${documento}`, { waitUntil: "networkidle" });
  assert.equal(await page.getByRole("textbox", { name: "nombre", exact: true }).inputValue(), prefijo + " lateral");
  await abrirTabla("/documentos/copias-literales");
  assert.ok(await page.getByRole("columnheader", { name: "Propietarios", exact: true }).count());

  await abrirTabla("/contratos/tipo/mutuo");
  const filaContrato = page.locator("table:visible tbody tr").filter({ hasText: prefijo }).first();
  await filaContrato.getByRole("button", { name: "S/ 123.45", exact: true }).click();
  await filaContrato.getByRole("spinbutton", { name: "monto", exact: true }).fill("456.78");
  await filaContrato.getByRole("spinbutton", { name: "monto", exact: true }).blur();
  await esperarValor("contratos", contrato, "monto", 456.78);
  await filaContrato.getByRole("button", { name: "2040-01-01", exact: true }).click();
  await filaContrato.locator('input[type="date"]').fill("2040-01-02");
  await filaContrato.locator('input[type="date"]').blur();
  await esperarValor("contratos", contrato, "fecha_inicio", "2040-01-02");
  await page.getByRole("button", { name: "Editar relación: acreedor", exact: true }).first().click();
  await page.getByRole("textbox", { name: "Buscar relación" }).fill(prefijo);
  await page.getByRole("dialog").getByRole("button", { name: `+ ${prefijo}`, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: `✓ ${prefijo}`, exact: true }).waitFor();
  await page.getByRole("dialog").getByRole("button", { name: "Cerrar", exact: true }).last().click();
  const vinculosContrato = await admin.from("vinculos").select("rol").eq("origen_id", contrato).eq("destino_id", propietario);
  assert.ok(vinculosContrato.data.some((v) => v.rol === "acreedor"));
  await page.getByRole("button", { name: "Editar relación: deudor", exact: true }).first().click();
  await page.getByRole("textbox", { name: "Buscar relación" }).fill(prefijo);
  await page.getByRole("dialog").getByRole("button", { name: `+ ${prefijo}`, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: `✓ ${prefijo}`, exact: true }).waitFor();
  await page.getByRole("dialog").getByRole("button", { name: "Cerrar", exact: true }).last().click();
  const dosRoles = await admin.from("vinculos").select("rol").eq("origen_id", contrato).eq("destino_id", propietario);
  assert.deepEqual(dosRoles.data.map((v) => v.rol).sort(), ["acreedor", "deudor"]);
  await page.getByRole("button", { name: "Editar relación: acreedor", exact: true }).first().locator("..").getByRole("button", { name: `Desvincular ${prefijo}`, exact: true }).click();
  await page.getByRole("button", { name: "Editar relación: acreedor", exact: true }).first().locator("..").getByRole("button", { name: `Desvincular ${prefijo}`, exact: true }).waitFor({ state: "detached" });
  const unRol = await admin.from("vinculos").select("rol").eq("origen_id", contrato).eq("destino_id", propietario);
  assert.deepEqual(unRol.data.map((v) => v.rol), ["deudor"]);

  await abrirTabla("/procesos/materia/civil");
  const fechaInput = page.locator('input[aria-label="Fecha de próxima diligencia"]:visible').first();
  await fechaInput.fill("2040-02-03");
  await fechaInput.blur();
  await page.waitForTimeout(2000);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "Buscar registros" }).fill(prefijo);
  assert.equal(await page.locator('input[aria-label="Fecha de próxima diligencia"]:visible').first().inputValue(), "2040-02-03");
  await page.goto(base + `/procesos/${proceso}`, { waitUntil: "networkidle" });
  assert.equal(await page.locator('input[aria-label="Fecha de próxima diligencia"]').inputValue(), "2040-02-03");

  await page.goto(base + `/entidades/personal/${persona}`, { waitUntil: "networkidle" });
  await page.getByRole("spinbutton", { name: "remuneracion" }).fill("125.50");
  await page.getByRole("spinbutton", { name: "remuneracion" }).blur();
  await esperarValor("personal", persona, "remuneracion", 125.5);
  for (const ruta of process.env.AUDIT_QUICK ? [] : ["/entidades/propietarios", "/entidades/predios", "/entidades/vehiculos", "/entidades/concesiones", "/entidades/oficinas", "/entidades/personal", "/procesos/materia/sunafil"]) {
    await page.goto(base + ruta, { waitUntil: "networkidle", timeout: 90000 });
    assert.equal(new URL(page.url()).pathname, ruta);
    console.log(`Vista comprobada: ${ruta}`);
  }
  assert.deepEqual(errores, []);
  console.log("OK: edición, persistencia, relaciones inversas, roles contractuales y fecha de diligencia.");
} catch (error) {
  if (page) {
    await page.screenshot({ path: "/private/tmp/auditoria-tablas-error.png" }).catch(() => {});
    console.log(await page.locator("textarea:visible, input:visible").evaluateAll((inputs) => inputs.map((i) => ({ tag: i.tagName, label: i.getAttribute("aria-label"), type: i.getAttribute("type") }))));
  }
  throw error;
} finally {
  if (browser) await browser.close();
  const proceso = creados.find((r) => r.tabla === "procesos");
  if (proceso) {
    const { data } = await admin.from("vinculos").select("destino_id").eq("origen_id", proceso.id).eq("destino_tipo", "evento");
    for (const v of data ?? []) creados.push({ tabla: "eventos", id: v.destino_id });
  }
  for (const { tabla, id } of [...creados].reverse()) {
    for (const campo of ["origen_id", "destino_id"]) {
      const { error } = await admin.from("vinculos").delete().eq(campo, id);
      if (error) console.error(`No se pudo limpiar vínculo de prueba: ${error.message}`);
    }
    const { error } = await admin.from(tabla).delete().eq("id", id);
    if (error) console.error(`No se pudo limpiar ${tabla} de prueba: ${error.message}`);
  }
  if (usuario) {
    const { error } = await admin.auth.admin.deleteUser(usuario);
    if (error) throw error;
  }
  console.log("Finalizó la limpieza de la cuenta y los registros temporales de esta auditoría.");
}
