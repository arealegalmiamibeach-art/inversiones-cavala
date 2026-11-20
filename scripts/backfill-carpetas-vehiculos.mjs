#!/usr/bin/env node
/**
 * Restaura la estructura de carpetas anidadas que Vehículos tenía en Notion
 * (TARJETA DE PROPIEDAD, POLIZA, SOAT/año, IMPUESTO/año/mes…), leyendo el
 * bloque <aside> de cada ficha .md del paquete de respaldo y volcando la
 * ruta resultante en `archivos.carpeta` (separador "/").
 *
 * La única fuente de verdad para decidir A QUÉ vehículo pertenece cada .md es
 * `archivos.ruta_origen`, que ya guarda el nombre de carpeta real usado en la
 * migración (p. ej. "Lenin Cerna/Vehículos ALI (1)/T5K-007/archivo.pdf").
 * Hay DOS lotes de migración con convención de ruta distinta para el mismo
 * conjunto de vehículos ("…/Vehículos ALI (1)/…" y "…/Vehículos ALI/…", sin
 * "(1)") — ver `LOTES_RUTA`. Cuando existen dos .md duplicados para el mismo
 * vehículo (Notion dejó variantes con distinto nombre de carpeta), cada uno
 * suele coincidir con UN lote distinto, así que ambos aportan filas.
 *
 * Uso:
 *   node scripts/backfill-carpetas-vehiculos.mjs            (simulación)
 *   node scripts/backfill-carpetas-vehiculos.mjs --apply    (escribe)
 */

import { readFileSync } from "node:fs";
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MD_DIR = path.join(ROOT, "PAQUETE_AVALA_COMPLETO", "03_CONTENIDO_PAGINAS", "Vehículos ALI");
const BACKUP_PATH = path.join(
  ROOT,
  "audit-backups",
  `carpetas-vehiculos-${new Date().toISOString().slice(0, 10)}-before.json`
);

function fail(message) {
  throw new Error(message);
}

function loadEnv() {
  const raw = readFileSyncSafe(path.join(ROOT, ".env"));
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, "");
  }
}

function readFileSyncSafe(p) {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

// ─── Parseo de la lista anidada estilo Notion (dentro o fuera de <aside>) ──

/**
 * La mayoría de fichas envuelven su árbol de carpetas en `<aside>...</aside>`,
 * pero varias (AZN-879, BVV-740, H2S-077, TFB-830...) lo dejan como bullets
 * sueltos directo en el cuerpo de la página, sin ese wrapper. `<aside>` y
 * `</aside>` son, para este parser, simples líneas de texto sin "- " ni
 * "[...](...)" — no afectan el resultado — así que basta con procesar SIEMPRE
 * el documento completo en vez de exigir el wrapper.
 */
function parseAside(mdText) {
  const lines = mdText.split(/\r?\n/);
  const stack = []; // { depth, label }
  const encontrados = []; // { rawPath, breadcrumb }
  // El destino del link puede tener sus propios paréntesis (p. ej.
  // "ConstanciaBoleta_(2).pdf"): capturar todo hasta el ÚLTIMO ")" de la
  // línea (greedy), no hasta el primero — [^)]+ cortaría en "...(2)".
  const linkRe = /!?\[[^\]]*\]\((.+)\)/g;

  for (const rawLine of lines) {
    if (!rawLine.trim()) continue;
    const leading = rawLine.match(/^ */)[0].length;
    const trimmed = rawLine.trim();

    if (trimmed.startsWith("- ")) {
      const label = trimmed.slice(2).trim();
      const depth = Math.round(leading / 4);
      while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
      stack.push({ depth, label });
      continue;
    }

    linkRe.lastIndex = 0;
    let m;
    while ((m = linkRe.exec(trimmed))) {
      const ownerDepth = Math.max(0, Math.round(leading / 4) - 1);
      const breadcrumb = stack.filter((e) => e.depth <= ownerDepth).map((e) => e.label);
      encontrados.push({ rawPath: m[1], breadcrumb });
    }
  }
  return encontrados;
}

function decodePath(rawPath) {
  try {
    // NFC: `ruta_origen` quedó grabado con acentos en forma NFD (p. ej. "í"
    // como i + acento combinante — típico de un export/filesystem en macOS),
    // mientras que decodeURIComponent produce NFC. Sin normalizar ambos lados
    // al mismo formato, cualquier nombre con tilde nunca hace match.
    return decodeURIComponent(rawPath).normalize("NFC");
  } catch {
    return rawPath.normalize("NFC");
  }
}

// ─── Índices desde `archivos.ruta_origen`: segmento de carpeta real usado ───
//
// Hay DOS lotes de migración con convención de ruta distinta para el mismo
// conjunto de vehículos:
//   - "…/Vehículos ALI (1)/<segmento>/<archivo>"
//   - "…/Vehículos ALI/<segmento>/<archivo>"                (sin "(1)")
// Un mismo vehículo puede tener archivos en ambos lotes, a veces con el
// MISMO nombre de segmento (p. ej. "AZN-879" en los dos) y a veces con uno
// ligeramente distinto — el del lote sin "(1)" suele coincidir con la ficha
// .md "duplicada" que Notion dejó (p. ej. "CKK-829- MAZDA BT 50 NARANJA" en
// vez de "CKK-829"). Los índices se mantienen SEPARADOS por lote — nunca se
// funden en un solo Map — para que un archivo del segundo lote con el mismo
// nombre que uno del primero no le gane el lugar por sobrescritura silenciosa.
const LOTES_RUTA = ["Vehículos ALI (1)/", "Vehículos ALI/"];

function ubicarEnLote(rutaOrigen) {
  const normalizada = rutaOrigen.normalize("NFC");
  for (const lote of LOTES_RUTA) {
    const i = normalizada.indexOf(lote);
    if (i === -1) continue;
    const resto = normalizada.slice(i + lote.length); // "<segmento>/<archivo>"
    const barra = resto.indexOf("/");
    if (barra === -1) continue;
    return { lote, segmento: resto.slice(0, barra) };
  }
  return null;
}

function segmentoDeRutaOrigen(rutaOrigen) {
  return ubicarEnLote(rutaOrigen)?.segmento ?? null;
}

async function main() {
  loadEnv();
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: archivos, error } = await db
    .from("archivos")
    .select("id, entidad_id, nombre_original, ruta_origen, carpeta, eliminado_en")
    .eq("entidad_tipo", "vehiculo");
  if (error) fail(`No se pudo leer archivos: ${error.message}`);

  const activos = archivos.filter((a) => a.eliminado_en === null && ubicarEnLote(a.ruta_origen ?? ""));

  // Un Map<segmento, Map<nombre, archivo>> POR LOTE — nunca se funden entre sí.
  const bucketsPorLote = new Map(LOTES_RUTA.map((lote) => [lote, new Map()]));
  for (const archivo of activos) {
    const ubicacion = ubicarEnLote(archivo.ruta_origen);
    if (!ubicacion) continue;
    const porSegmento = bucketsPorLote.get(ubicacion.lote);
    const porNombre = porSegmento.get(ubicacion.segmento) ?? new Map();
    porNombre.set(archivo.nombre_original.normalize("NFC"), archivo);
    porSegmento.set(ubicacion.segmento, porNombre);
  }

  function buscarFila(segmento, archivoNombre) {
    for (const lote of LOTES_RUTA) {
      const fila = bucketsPorLote.get(lote)?.get(segmento)?.get(archivoNombre);
      if (fila) return fila;
    }
    return null;
  }

  const nombresMd = (await readdir(MD_DIR)).filter((f) => f.endsWith(".md"));
  const fichas = [];
  for (const nombreMd of nombresMd) {
    const contenido = await readFile(path.join(MD_DIR, nombreMd), "utf8");
    const entradas = parseAside(contenido);
    if (entradas.length > 0) fichas.push({ nombreMd, entradas });
  }

  const actualizaciones = []; // { id, carpetaNueva, carpetaActual, archivo, fuente }
  const vistos = new Set();
  const coincidieron = new Set(); // .md que aportó al menos una fila
  const mdConCarpetas = fichas.length;

  for (const { nombreMd, entradas } of fichas) {
    for (const { rawPath, breadcrumb } of entradas) {
      const decodificado = decodePath(rawPath);
      const barra = decodificado.indexOf("/");
      if (barra === -1) continue; // no trae "carpeta/archivo", no se puede ubicar
      const segmento = decodificado.slice(0, barra);
      const archivoNombre = decodificado.slice(barra + 1);

      const fila = buscarFila(segmento, archivoNombre);
      if (!fila) continue;

      coincidieron.add(nombreMd);
      if (breadcrumb.length === 0) continue; // archivo suelto en la raíz del aside: null ya es lo correcto
      if (vistos.has(fila.id)) continue; // ya resuelto por otra entrada/otro .md
      vistos.add(fila.id);
      const carpetaNueva = breadcrumb.join("/");
      if (fila.carpeta === carpetaNueva) continue; // ya está correcto (reintento)
      actualizaciones.push({
        id: fila.id,
        carpetaActual: fila.carpeta,
        carpetaNueva,
        nombre: fila.nombre_original,
        segmento,
        fuente: nombreMd,
      });
    }
  }
  const mdSinCoincidencia = fichas.map((f) => f.nombreMd).filter((nombreMd) => !coincidieron.has(nombreMd));

  console.log(`Fichas .md con estructura de carpetas detectada: ${mdConCarpetas}/${nombresMd.length}`);
  console.log(`Archivos activos de vehículos con ruta_origen reconocible: ${activos.filter((a) => segmentoDeRutaOrigen(a.ruta_origen)).length}`);
  console.log(`Coincidencias encontradas (archivo -> carpeta): ${actualizaciones.length}`);
  if (mdSinCoincidencia.length) {
    console.log(`.md con carpetas detectadas pero sin ninguna coincidencia (probable duplicado no usado): ${mdSinCoincidencia.join(", ")}`);
  }

  const sinResolver = activos.filter((a) => segmentoDeRutaOrigen(a.ruta_origen) && !vistos.has(a.id) && a.carpeta === null);
  if (sinResolver.length) {
    console.log(`Archivos de vehículos sin carpeta asignada (quedan en la raíz, sin cambios): ${sinResolver.length}`);
    if (process.env.DEBUG_SIN_RESOLVER) {
      for (const a of sinResolver) console.log(`  [${segmentoDeRutaOrigen(a.ruta_origen)}] ${a.nombre_original}`);
    }
  }

  if (actualizaciones.length === 0) {
    console.log("Nada que actualizar.");
    return;
  }

  console.log("\nEjemplo de cambios (hasta 15):");
  for (const cambio of actualizaciones.slice(0, 15)) {
    console.log(`  [${cambio.segmento}] ${cambio.nombre}: ${cambio.carpetaActual ?? "(sin carpeta)"} -> ${cambio.carpetaNueva}`);
  }

  if (!APPLY) {
    console.log("\nSimulación terminada. No se modificó la base. Usa --apply para escribir.");
    return;
  }

  await mkdir(path.dirname(BACKUP_PATH), { recursive: true });
  const respaldo = activos.filter((a) => vistos.has(a.id));
  await writeFile(BACKUP_PATH, JSON.stringify(respaldo, null, 2));
  console.log(`Respaldo de ${respaldo.length} filas guardado en ${path.relative(ROOT, BACKUP_PATH)}`);

  let aplicados = 0;
  for (const cambio of actualizaciones) {
    let query = db.from("archivos").update({ carpeta: cambio.carpetaNueva }).eq("id", cambio.id);
    // No pisa si alguien cambió la carpeta mientras tanto.
    query = cambio.carpetaActual === null ? query.is("carpeta", null) : query.eq("carpeta", cambio.carpetaActual);
    const { error: updateError, data: updated } = await query.select("id");
    if (updateError) fail(`No se pudo actualizar ${cambio.id}: ${updateError.message}`);
    if (!updated?.length) fail(`${cambio.id} cambió de carpeta entre la lectura y la escritura; se aborta sin seguir`);
    aplicados += 1;
  }
  console.log(`Listo: ${aplicados} archivos actualizados con su carpeta.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
