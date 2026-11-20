#!/usr/bin/env node
/**
 * Repara la jerarquía padre → adenda que se perdió al importar Notion.
 *
 * La importación sí trajo las aristas contrato↔contrato a `vinculos`, pero no
 * marcó cuál extremo es el hijo: ninguna fila de `contratos` tiene
 * `extra.es_adenda` ni `extra.documento_padre`. Sin esa marca
 * `cargarMapaAdendas()` no puede orientar una arista recíproca y deja todas
 * las adendas como contratos raíz (por eso "ACUERDO DE PRORROGA ..." sale al
 * mismo nivel que su contrato en vez de dentro del desplegable).
 *
 * La orientación correcta se lee del export completo de Notion, columna
 * "ítem principal" (el padre de cada sub-item).
 *
 * Casos donde padre y sub-item comparten el mismo título (Notion los dejó
 * indistinguibles por nombre, y la importación por eso no generó ningún
 * vínculo para ellos) se resuelven por continuidad de fechas: el contrato
 * que termina cuando el otro empieza es el padre. Si hay dos pares con
 * fechas idénticas (p. ej. dos renovaciones en paralelo con distinto
 * contratante, dato que la importación no conservó), se emparejan por
 * orden de id: el resultado es correcto en fechas y montos de cualquier
 * forma, sólo el contratante podría quedar cruzado entre pares gemelos.
 *
 *   node scripts/repair-adendas-jerarquia.mjs            # dry-run
 *   node scripts/repair-adendas-jerarquia.mjs --apply    # escribe
 *
 * Con --limpiar-reciprocos borra además la arista invertida hijo → padre que
 * dejó la importación. No hace falta para el árbol; sólo limpia el grafo.
 *
 * Requiere SUPABASE_URL y SUPABASE_SERVICE_KEY en el entorno (.env).
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const CSV = path.join(
  ROOT,
  "PAQUETE_AVALA_COMPLETO/01_TABLAS/CSV_COMPLETO_NOTION/Contratos/Contratos MBP-OTROS_all.csv"
);
const APPLY = process.argv.includes("--apply");
const LIMPIAR_RECIPROCOS = process.argv.includes("--limpiar-reciprocos");

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error("Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY en el entorno.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

/** CSV con comillas y saltos de línea dentro de campo. */
function parseCsv(texto) {
  const filas = [];
  let campo = "";
  let fila = [];
  let entreComillas = false;
  const limpio = texto.replace(/^\uFEFF/, "");
  for (let i = 0; i < limpio.length; i++) {
    const ch = limpio[i];
    if (entreComillas) {
      if (ch === '"') {
        if (limpio[i + 1] === '"') { campo += '"'; i++; }
        else entreComillas = false;
      } else campo += ch;
      continue;
    }
    if (ch === '"') entreComillas = true;
    else if (ch === ",") { fila.push(campo); campo = ""; }
    else if (ch === "\n") { fila.push(campo); filas.push(fila); fila = []; campo = ""; }
    else if (ch !== "\r") campo += ch;
  }
  if (campo !== "" || fila.length > 0) { fila.push(campo); filas.push(fila); }
  const cabecera = filas.shift() ?? [];
  return filas
    .filter((f) => f.some((c) => c.trim() !== ""))
    .map((f) => Object.fromEntries(cabecera.map((c, i) => [c, f[i] ?? ""])));
}

/** El export de Notion escribe "NOMBRE (ruta/al/archivo.csv)": nos quedamos con el nombre. */
function soloNombre(valor) {
  return valor.replace(/\s*\([^()]*\.csv\)\s*$/u, "").trim();
}

/**
 * El id de página de Notion va al final del nombre de archivo enlazado. Se
 * ancla a `.csv)` porque el `%20` que lo precede también son hexadecimales
 * válidos y un match suelto devuelve el id desplazado un carácter.
 */
function hashNotion(valor) {
  return /([0-9a-f]{32})\.csv\)\s*$/.exec(valor ?? "")?.[1] ?? null;
}

// El ETL derivó cada id con uuid5 sobre el id de página de Notion. Reproducirlo
// permite validar cada deducción contra el dato real cuando la fila llegó por
// esa vía (el resto se resolvió por nombre, y ahí el id no es reconstruible).
const NS_ETL = "6ca7b810-9dad-11d1-80b4-00c04fd430c8";

function uuid5(namespace, nombre) {
  const digest = createHash("sha1")
    .update(Buffer.concat([Buffer.from(namespace.replace(/-/g, ""), "hex"), Buffer.from(nombre)]))
    .digest()
    .subarray(0, 16);
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = Buffer.from(digest).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function normalizar(valor) {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

const parejas = parseCsv(await readFile(CSV, "utf8"))
  .map((fila) => ({
    hijo: soloNombre(fila["Servicio"] ?? ""),
    padre: soloNombre(fila["ítem principal"] ?? ""),
    hashPadre: hashNotion(fila["ítem principal"]),
  }))
  .filter((p) => p.hijo && p.padre);

console.log(`Sub-items declarados en el export de Notion: ${parejas.length}`);

const { data: contratos, error } = await supabase
  .from("contratos")
  .select("id, nombre, tipo, extra, fecha_inicio, fecha_vencimiento");
if (error) { console.error("No se pudo leer contratos:", error.message); process.exit(1); }

const porNombre = new Map();
for (const contrato of contratos) {
  const clave = normalizar(contrato.nombre);
  if (!porNombre.has(clave)) porNombre.set(clave, []);
  porNombre.get(clave).push(contrato);
}

// Aristas que sí trajo la importación: sirven de desempate cuando un nombre
// resuelve a varias filas (la arista existe, lo único que faltaba era saber
// hacia dónde apunta).
const { data: aristas } = await supabase
  .from("vinculos")
  .select("origen_id, destino_id")
  .eq("origen_tipo", "contrato")
  .eq("destino_tipo", "contrato");
const vecinos = new Map();
for (const arista of aristas ?? []) {
  for (const [a, b] of [[arista.origen_id, arista.destino_id], [arista.destino_id, arista.origen_id]]) {
    if (!vecinos.has(a)) vecinos.set(a, new Set());
    vecinos.get(a).add(b);
  }
}

/** Entre varios candidatos con el mismo nombre, gana el que ya está vinculado. */
function desempatar(candidatos, otroExtremo) {
  if (candidatos.length <= 1) return candidatos;
  if (!otroExtremo) return candidatos;
  const conArista = candidatos.filter((c) => vecinos.get(otroExtremo.id)?.has(c.id));
  return conArista.length === 1 ? conArista : candidatos;
}

/**
 * Padre y sub-item con el mismo título: el nombre no sirve para nada, hay
 * que resolver por continuidad de fechas dentro del propio grupo de
 * homónimos. Devuelve las parejas padre→hijo que pudo armar (puede ser más
 * de una si hay varios pares gemelos con las mismas fechas).
 */
function resolverPorFechas(nombreNormalizado) {
  const filas = porNombre.get(nombreNormalizado) ?? [];
  if (filas.length < 2 || filas.length % 2 !== 0) return null;
  if (filas.some((f) => !f.fecha_inicio)) return null;

  const grupos = new Map(); // "inicio|vencimiento" -> filas
  for (const fila of filas) {
    const clave = `${fila.fecha_inicio}|${fila.fecha_vencimiento ?? ""}`;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(fila);
  }
  if (grupos.size !== 2) return null; // más de dos fechas distintas: no es un par simple

  const [primero, segundo] = [...grupos.values()].sort(
    (a, b) => a[0].fecha_inicio.localeCompare(b[0].fecha_inicio)
  );
  if (primero.length !== segundo.length) return null;
  // El primero debe terminar cuando (o poco antes de que) empiece el segundo.
  if (primero[0].fecha_vencimiento && primero[0].fecha_vencimiento > segundo[0].fecha_inicio) return null;

  const ordenados = (arr) => [...arr].sort((a, b) => a.id.localeCompare(b.id));
  const padres = ordenados(primero);
  const hijos = ordenados(segundo);
  return padres.map((padre, i) => ({ padre, hijo: hijos[i] }));
}

const porId = new Map(contratos.map((contrato) => [contrato.id, contrato]));

/**
 * Cuando la fila del padre llegó a la base por su id de Notion, el id es
 * reconstruible y sirve de comprobación dura de la deducción. Devuelve la fila
 * real del padre, o null si esa vía no aplica.
 */
function padreSegunNotion(hashPadre) {
  if (!hashPadre) return null;
  return porId.get(uuid5(NS_ETL, hashPadre)) ?? null;
}

const aMarcar = [];
const ambiguas = [];
const conflictos = [];

function registrar(par) {
  if (aMarcar.some((existente) => existente.hijo.id === par.hijo.id)) return;
  aMarcar.push(par);
}

for (const pareja of parejas) {
  const confirmado = padreSegunNotion(pareja.hashPadre);

  if (normalizar(pareja.hijo) === normalizar(pareja.padre)) {
    const resuelto = resolverPorFechas(normalizar(pareja.hijo));
    if (!resuelto) {
      const filas = porNombre.get(normalizar(pareja.hijo)) ?? [];
      ambiguas.push({ ...pareja, hijos: filas.length, padres: filas.length, motivo: "mismo titulo, fechas no lo resuelven" });
      continue;
    }
    // Si el id de Notion identifica al padre, tiene que ser uno de los que la
    // deducción por fechas eligió; si no, algo no cuadra y no se toca.
    if (confirmado && !resuelto.some((par) => par.padre.id === confirmado.id)) {
      conflictos.push({ ...pareja, esperado: confirmado.id, deducido: resuelto.map((p) => p.padre.id).join(", ") });
      continue;
    }
    for (const par of resuelto) {
      registrar({ ...par, metodo: confirmado ? "notion:id+fechas" : "fechas-consecutivas" });
    }
    continue;
  }

  let hijos = porNombre.get(normalizar(pareja.hijo)) ?? [];
  let padres = porNombre.get(normalizar(pareja.padre)) ?? [];
  if (hijos.length === 1) padres = desempatar(padres, hijos[0]);
  if (padres.length === 1) hijos = desempatar(hijos, padres[0]);

  if (hijos.length !== 1 || padres.length !== 1) {
    ambiguas.push({ ...pareja, hijos: hijos.length, padres: padres.length });
    continue;
  }
  if (confirmado && confirmado.id !== padres[0].id) {
    conflictos.push({ ...pareja, esperado: confirmado.id, deducido: padres[0].id });
    continue;
  }
  registrar({ hijo: hijos[0], padre: padres[0], metodo: confirmado ? "notion:id" : "notion:item-principal" });
}

console.log(`\nParejas resolubles: ${aMarcar.length}`);
for (const { hijo, padre, metodo } of aMarcar) {
  const extra = hijo.extra ?? {};
  const yaEsta = extra.documento_padre === padre.id;
  console.log(`  ${yaEsta ? "=" : "+"} "${hijo.nombre.slice(0, 62)}"  [${metodo}]`);
  console.log(`      hijo de "${padre.nombre.slice(0, 58)}" (${padre.id})`);
}

if (conflictos.length > 0) {
  console.log(`\nCONFLICTOS (el id de Notion contradice la deducción, no se tocan): ${conflictos.length}`);
  for (const c of conflictos) {
    console.log(`  ! "${c.hijo.slice(0, 55)}" → notion dice ${c.esperado}, deducción dice ${c.deducido}`);
  }
}

if (ambiguas.length > 0) {
  console.log(`\nParejas que NO se tocan (revisar a mano): ${ambiguas.length}`);
  for (const a of ambiguas) {
    const motivo = a.motivo ?? `resuelve a ${a.hijos} hijo(s) / ${a.padres} padre(s)`;
    console.log(`  - "${a.hijo.slice(0, 62)}" → ${motivo}`);
  }
}

if (!APPLY) {
  console.log("\nDry-run. Volver a correr con --apply para escribir.");
  process.exit(0);
}

// Respaldo antes de tocar nada: el `extra` completo de cada hijo y las aristas
// actuales, para poder revertir con exactitud.
const sello = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
const carpetaBackup = path.join(ROOT, "audit-backups", `adendas-jerarquia-${sello}`);
await mkdir(carpetaBackup, { recursive: true });
await writeFile(
  path.join(carpetaBackup, "antes.json"),
  JSON.stringify(
    {
      generado: new Date().toISOString(),
      nota: "Estado previo a repair-adendas-jerarquia.mjs --apply. Para revertir: restaurar `extra` de cada hijo y borrar los vínculos con resuelto_por='reparacion-jerarquia'.",
      hijos: aMarcar.map(({ hijo, padre, metodo }) => ({
        id: hijo.id,
        nombre: hijo.nombre,
        metodo,
        padre_asignado: padre.id,
        extra_previo: hijo.extra ?? null,
      })),
      vinculos_contrato_contrato_previos: aristas ?? [],
    },
    null,
    2
  ),
  "utf8"
);
console.log(`\nRespaldo escrito en ${path.relative(ROOT, carpetaBackup)}/antes.json`);

let marcados = 0;
let vinculosCreados = 0;
let vinculosBorrados = 0;

for (const { hijo, padre, metodo } of aMarcar) {
  const extra = { ...(hijo.extra ?? {}) };
  // `origen` se deja sin tocar a propósito: estas filas vienen de Notion, no
  // de la app, y `creadaEnApp` es lo único que habilita borrarlas desde la UI.
  extra.es_adenda = true;
  extra.documento_padre = padre.id;
  extra.clase = extra.clase ?? "adenda";
  // Queda registrado de dónde salió el enlace: "notion:*" es dato duro,
  // "fechas-consecutivas" es deducción y se puede corregir a mano sin miedo.
  extra.documento_padre_origen = metodo;

  const { error: errorUpdate } = await supabase.from("contratos").update({ extra }).eq("id", hijo.id);
  if (errorUpdate) { console.error(`  ! ${hijo.nombre}: ${errorUpdate.message}`); continue; }
  marcados++;

  // El vínculo dirigido padre → hijo es lo que dibuja la relación en el grafo.
  const { data: existente } = await supabase
    .from("vinculos")
    .select("id")
    .eq("origen_tipo", "contrato").eq("origen_id", padre.id)
    .eq("destino_tipo", "contrato").eq("destino_id", hijo.id);
  if (!existente || existente.length === 0) {
    // `resuelto_por` tiene CHECK: sólo 'notion_id' | 'nombre' | 'manual'.
    // 'manual' es lo que usa `crearAdenda()` en la app.
    const { error: errorVinculo } = await supabase.from("vinculos").insert({
      origen_tipo: "contrato", origen_id: padre.id,
      destino_tipo: "contrato", destino_id: hijo.id,
      rol: null, resuelto_por: "manual",
    });
    if (errorVinculo) console.error(`  ! vínculo ${padre.id} -> ${hijo.id}: ${errorVinculo.message}`);
    else vinculosCreados++;
  }

  // La arista recíproca hijo → padre sobra, pero no estorba: `documento_padre`
  // manda y `cargarMapaAdendas()` ya corta los ciclos. Sólo se borra si se pide.
  if (!LIMPIAR_RECIPROCOS) continue;
  const { data: inversos } = await supabase
    .from("vinculos")
    .select("id")
    .eq("origen_tipo", "contrato").eq("origen_id", hijo.id)
    .eq("destino_tipo", "contrato").eq("destino_id", padre.id);
  for (const inverso of inversos ?? []) {
    const { error: errorBorrado } = await supabase.from("vinculos").delete().eq("id", inverso.id);
    if (!errorBorrado) vinculosBorrados++;
  }
}

console.log(`\nListo: ${marcados} adendas marcadas, ${vinculosCreados} vínculos creados, ${vinculosBorrados} recíprocos borrados.`);
