#!/usr/bin/env node
/**
 * Foto del esquema de producción → supabase/esquema-produccion.sql
 *
 *   node scripts/volcar-esquema.mjs
 *
 * Sólo lee: corre `supabase/volcar-esquema.sql` contra el proyecto linkeado con
 * la CLI de Supabase (`supabase db query --linked`, sin Docker). Volver a
 * correrlo después de cada `supabase db push` para que la foto no se quede
 * atrás. Se niega a escribir si la salida parece contener un secreto.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const salida = execFileSync(
  "supabase",
  ["db", "query", "--linked", "-o", "json", "-f", "supabase/volcar-esquema.sql"],
  { cwd: raiz, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "inherit"] }
);

const json = JSON.parse(salida.slice(salida.indexOf("{"), salida.lastIndexOf("}") + 1));
const ddl = json.rows?.[0]?.ddl;
if (typeof ddl !== "string" || ddl.length < 1000) {
  console.error("La consulta no devolvió el esquema esperado.");
  process.exit(1);
}

// Un JWT, una clave de API o un encabezado Bearer no tienen por qué estar en
// el esquema; si aparecen, mejor revisar a mano que subirlos al repo.
const sospechoso = ddl.match(/eyJ[A-Za-z0-9_-]{20,}|Bearer\s+[A-Za-z0-9._-]{20,}|sk-[A-Za-z0-9_-]{20,}|re_[A-Za-z0-9]{20,}/);
if (sospechoso) {
  console.error(`La salida contiene algo que parece un secreto (${sospechoso[0].slice(0, 12)}…). No se escribió nada.`);
  process.exit(1);
}

const fecha = new Date().toISOString().slice(0, 10);
const cabecera = `-- ============================================================
-- ESQUEMA DE PRODUCCIÓN — FOTO GENERADA, NO EDITAR A MANO
-- ============================================================
-- Generado el ${fecha} con \`node scripts/volcar-esquema.mjs\` desde el proyecto
-- linkeado. Las 16 primeras migraciones del repo (*_remote.sql) son
-- marcadores vacíos: el esquema base sólo existía en producción, y esta foto
-- es lo que permite reconstruirlo. No es una migración (\`db push\` no la lee).
-- Incluye extensiones, tipos, funciones, tablas, restricciones, índices,
-- vistas, disparadores, RLS, políticas, permisos y tareas de pg_cron de los
-- esquemas public y privado. No incluye datos, auth, storage ni el Vault.

set check_function_bodies = false;

`;

writeFileSync(resolve(raiz, "supabase/esquema-produccion.sql"), `${cabecera}${ddl}\n`);
console.log(`supabase/esquema-produccion.sql: ${ddl.split("\n").length} líneas`);
