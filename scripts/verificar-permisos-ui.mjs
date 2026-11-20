// Verificación con dos cuentas temporales, sin enviar correos.
// PLAYWRIGHT_MODULE puede apuntar a una instalación local de Playwright.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const base = process.env.TEST_BASE_URL || "http://localhost:3108";
const creados = [];
let browser;

async function cuenta(rol, nombre) {
  const email = `permisos-${randomUUID()}@example.test`;
  const password = randomUUID() + "aA1!";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  creados.push(data.user.id);
  const { error: perfilError } = await admin.from("perfiles").update({ rol, activo: true, nombre, notificaciones_email: false }).eq("id", data.user.id);
  if (perfilError) throw perfilError;
  const cookies = [];
  const client = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: { getAll: () => cookies, setAll: (valores) => cookies.push(...valores) },
  });
  const { error: loginError } = await client.auth.signInWithPassword({ email, password });
  if (loginError) throw loginError;
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: "reduce" });
  await context.addCookies(cookies.map(({ name, value }) => ({ name, value, url: base, sameSite: "Lax" })));
  return { id: data.user.id, context, client };
}

try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
  });
  const editor = await cuenta("administrador", "Prueba administrador");
  const persona = await cuenta("soporte_documentario", "Prueba permisos");
  const page = await editor.context.newPage();
  page.setDefaultTimeout(20000);
  const errores = [];
  page.on("pageerror", (e) => errores.push(e.message));
  await page.goto(base + "/configuracion/usuarios", { waitUntil: "networkidle", timeout: 90000 });
  await page.getByRole("heading", { name: "Gestión de usuarios", exact: true }).waitFor();
  await page.screenshot({ path: "/private/tmp/cavala-usuarios-equipo.png", fullPage: true });
  await page.getByRole("button", { name: "Permisos por área", exact: true }).click();
  await page.getByRole("heading", { name: "Acceso por persona y área", exact: true }).waitFor();
  await page.getByRole("button", { name: "Prueba permisos Soporte documentario" }).click();
  assert.equal(await page.getByRole("radio", { name: "Vehículos: Visualizar", exact: true }).isChecked(), true);
  assert.equal(await page.getByRole("radio", { name: "Dashboard: Administrar", exact: true }).count(), 0, "Dashboard ofreció una acción de escritura inexistente");
  await page.getByRole("radio", { name: "Vehículos: Administrar", exact: true }).check();
  await page.getByRole("radio", { name: "Personal: Visualizar", exact: true }).check();
  await page.getByRole("radio", { name: "Contratos: Sin acceso", exact: true }).check();
  await page.getByRole("button", { name: "Guardar permisos", exact: true }).click();
  await page.getByText("Permisos guardados.", { exact: false }).waitFor({ timeout: 30000 });
  const { data: guardados, error: errorPermisos } = await admin.from("permisos_usuario").select("seccion,nivel").eq("usuario_id", persona.id);
  if (errorPermisos) throw errorPermisos;
  assert.deepEqual(Object.fromEntries(guardados.map((p) => [p.seccion, p.nivel])), { contratos: "sin_acceso", personal: "visualizar", vehiculos: "administrar" });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Permisos por área", exact: true }).click();
  await page.getByRole("button", { name: "Prueba permisos Soporte documentario" }).click();
  assert.equal(await page.getByRole("radio", { name: "Vehículos: Administrar", exact: true }).isChecked(), true);
  await page.screenshot({ path: "/private/tmp/cavala-usuarios-permisos.png", fullPage: true });
  // Descartar y protección de cambios pendientes.
  await page.getByRole("radio", { name: "Predios: Sin acceso", exact: true }).check();
  await page.getByRole("button", { name: /^Equipo/ }).click();
  await page.getByText("Guarda o descarta los cambios de permisos", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  assert.equal(await page.getByRole("radio", { name: "Predios: Visualizar", exact: true }).isChecked(), true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("radio", { name: "Vehículos: Visualizar", exact: true }).check();
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  assert.equal(await page.getByRole("radio", { name: "Vehículos: Administrar", exact: true }).isChecked(), true);
  await page.getByRole("radio", { name: "Vehículos: Administrar", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/private/tmp/cavala-usuarios-movil.png", fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "La vista desborda en móvil");

  const viewer = await persona.context.newPage();
  await viewer.goto(base + "/entidades/vehiculos", { waitUntil: "networkidle", timeout: 90000 });
  assert.equal(new URL(viewer.url()).pathname, "/entidades/vehiculos");
  assert.ok(await viewer.getByRole("button", { name: /nuevo vehículo/i }).count(), "Falta crear en el área administrable");
  await viewer.goto(base + "/entidades/personal", { waitUntil: "networkidle", timeout: 90000 });
  assert.equal(new URL(viewer.url()).pathname, "/entidades/personal");
  assert.equal(await viewer.getByRole("button", { name: /nuevo personal|nuevo registro|agregar personal/i }).count(), 0);
  await viewer.goto(base + "/contratos", { waitUntil: "networkidle", timeout: 90000 });
  assert.equal(new URL(viewer.url()).pathname, "/configuracion/perfil", "El acceso por URL ignoró Sin acceso");
  const { error: elevacion } = await persona.client.rpc("guardar_permisos_usuario", { p_usuario: persona.id, p_permisos: { contratos: "administrar" } });
  assert.ok(elevacion, "El usuario logró elevar sus propios permisos");
  assert.deepEqual(errores, [], "Errores en el navegador");
  console.log(JSON.stringify({ guardado: true, persistencia: true, descartar: true, proteccionCambios: true, permisosPorArea: true, accesoDirecto: true, movil: true, errores: 0 }));
} finally {
  if (browser) await browser.close();
  for (const id of creados.reverse()) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw error;
  }
  console.log("Cuentas temporales de prueba eliminadas.");
}
