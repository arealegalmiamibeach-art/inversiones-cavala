#!/usr/bin/env node
// Asigna `subtipo` (materia/tipo) a las propiedades personalizadas de
// procesos, documentos y contratos creadas antes de que existiera el alcance
// por tabla. Cada una queda en la materia/tipo donde ya tiene valores; si los
// tiene en varias, se divide en una copia por materia/tipo y cada valor pasa
// a la copia de la suya. Sin `--apply` sólo muestra el plan.
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const ALCANCE = {
  proceso: { tabla: "procesos", columna: "materia" },
  documento: { tabla: "documentos", columna: "tipo" },
  contrato: { tabla: "contratos", columna: "tipo" },
};

function fallar(mensaje) {
  throw new Error(mensaje);
}

function datos(resultado, etiqueta) {
  if (resultado.error) fallar(`${etiqueta}: ${resultado.error.message}`);
  return resultado.data ?? [];
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) fallar("Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY");
const db = createClient(url, key, { auth: { persistSession: false } });

const propiedades = datos(
  await db.from("propiedades_personalizadas").select("*").in("entidad_tipo", Object.keys(ALCANCE)).is("subtipo", null),
  "leer propiedades"
);

const plan = [];
for (const propiedad of propiedades) {
  const { tabla, columna } = ALCANCE[propiedad.entidad_tipo];
  const valores = datos(
    await db.from("valores_propiedad_personalizada").select("entidad_id").eq("propiedad_id", propiedad.id),
    `leer valores de ${propiedad.nombre}`
  );
  const ids = valores.map((valor) => valor.entidad_id);
  const filas = ids.length ? datos(await db.from(tabla).select(`id, ${columna}`).in("id", ids), `leer ${tabla}`) : [];
  const idsPorSubtipo = new Map();
  for (const fila of filas) {
    const subtipo = fila[columna];
    if (!subtipo) continue;
    if (!idsPorSubtipo.has(subtipo)) idsPorSubtipo.set(subtipo, []);
    idsPorSubtipo.get(subtipo).push(fila.id);
  }
  const subtipos = [...idsPorSubtipo.keys()].sort();
  if (subtipos.length === 0) {
    plan.push({ propiedad, subtipos, sinDatos: true });
    continue;
  }
  plan.push({ propiedad, subtipos, idsPorSubtipo });
}

for (const paso of plan) {
  const etiqueta = `${paso.propiedad.entidad_tipo} · ${paso.propiedad.nombre}`;
  if (paso.sinDatos) console.log(`${etiqueta}: sin valores, queda sin subtipo (sólo visible en la vista "todas")`);
  else if (paso.subtipos.length === 1) console.log(`${etiqueta}: → ${paso.subtipos[0]}`);
  else console.log(`${etiqueta}: se divide → ${paso.subtipos.map((s) => `${s} (${paso.idsPorSubtipo.get(s).length})`).join(", ")}`);
}

if (!APPLY) {
  console.log("Simulación. No se modificó la base de datos. Usa --apply para aplicar.");
  process.exit(0);
}

for (const paso of plan) {
  if (paso.sinDatos) continue;
  const { propiedad, subtipos, idsPorSubtipo } = paso;
  const [primero, ...resto] = subtipos;
  datos(await db.from("propiedades_personalizadas").update({ subtipo: primero }).eq("id", propiedad.id).select("id"), `asignar ${propiedad.nombre}`);
  for (const subtipo of resto) {
    const { id: _id, subtipo: _s, creado_en: _c, actualizado_en: _a, ...base } = propiedad;
    const [copia] = datos(
      await db.from("propiedades_personalizadas").insert({ ...base, subtipo }).select("id"),
      `copiar ${propiedad.nombre} para ${subtipo}`
    );
    datos(
      await db.from("valores_propiedad_personalizada").update({ propiedad_id: copia.id })
        .eq("propiedad_id", propiedad.id).in("entidad_id", idsPorSubtipo.get(subtipo)).select("entidad_id"),
      `mover valores de ${propiedad.nombre} a ${subtipo}`
    );
    // Una fecha conserva su tipo (dato/evento/vencimiento) en la copia.
    if (propiedad.tipo === "fecha") {
      const [config] = datos(await db.from("fechas_config").select("tipo").eq("fuente", `propiedad:${propiedad.id}`), "leer tipo de fecha");
      if (config) datos(await db.from("fechas_config").upsert({ fuente: `propiedad:${copia.id}`, tipo: config.tipo }).select("fuente"), "copiar tipo de fecha");
    }
  }
}

const pendientes = datos(
  await db.from("propiedades_personalizadas").select("id, entidad_tipo, subtipo, nombre").in("entidad_tipo", Object.keys(ALCANCE)).order("entidad_tipo"),
  "verificar"
);
for (const fila of pendientes) console.log(`${fila.entidad_tipo} · ${fila.subtipo ?? "(sin subtipo)"} · ${fila.nombre}`);
console.log("Aplicado.");
