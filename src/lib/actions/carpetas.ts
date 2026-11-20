"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRowsIn } from "@/lib/supabase/fetch-all";
import { puedeAdministrarEntidad } from "@/lib/auth/perfil";
import { esUuid } from "@/lib/contratos/adendas";
import { registrarEvento } from "@/lib/historial-server";
import { TIPOS_DOCUMENTO_VALIDOS } from "@/lib/relaciones/agrupar";

export type ResultadoCarpeta = { ok: true } | { ok: false; error: string };

const TABLA_POR_ENTIDAD: Record<string, string> = {
  propietario: "propietarios",
  predio: "predios",
  vehiculo: "vehiculos",
  concesion: "concesiones_mineras",
  personal: "personal",
  oficina_registral: "oficinas_registrales",
  proceso: "procesos",
  documento: "documentos",
  contrato: "contratos",
};

const RUTA_POR_ENTIDAD: Record<string, string> = {
  propietario: "/entidades/propietarios",
  predio: "/entidades/predios",
  vehiculo: "/entidades/vehiculos",
  concesion: "/entidades/concesiones",
  personal: "/entidades/personal",
  oficina_registral: "/entidades/oficinas",
  proceso: "/procesos",
  documento: "/documentos",
  contrato: "/contratos",
};

/** Mismo criterio que la subida de archivos: hace falta escritura en la entidad dueña Y en el área "Documentos". */
async function puedeGestionarArchivos(entidadTipo: string): Promise<boolean> {
  return (await puedeAdministrarEntidad(entidadTipo)) && (await puedeAdministrarEntidad("documento"));
}

function validarEntidad(entidadTipo: string, entidadId: string): string | null {
  if (!TABLA_POR_ENTIDAD[entidadTipo]) return "Tipo de entidad inválido";
  if (!esUuid(entidadId)) return "Entidad inválida";
  return null;
}

async function entidadExiste(
  supabase: Awaited<ReturnType<typeof createClient>>,
  entidadTipo: string,
  entidadId: string
): Promise<boolean> {
  const { data } = await supabase.from(TABLA_POR_ENTIDAD[entidadTipo]).select("id").eq("id", entidadId).maybeSingle();
  return Boolean(data);
}

function revalidarEntidad(entidadTipo: string, entidadId: string) {
  const ruta = RUTA_POR_ENTIDAD[entidadTipo];
  if (!ruta) return;
  revalidatePath(ruta);
  revalidatePath(`${ruta}/${entidadId}`);
}

/**
 * Revela (crea si no existía) una categoría de documento vacía —predefinida
 * o personalizada— en esta ficha, para poder verla y usarla antes de que
 * tenga su primer documento. Idempotente: elegirla dos veces no falla.
 */
export async function crearCarpetaDocumento(
  entidadTipo: string,
  entidadId: string,
  tipoDocumento: string
): Promise<ResultadoCarpeta> {
  const errorEntidad = validarEntidad(entidadTipo, entidadId);
  if (errorEntidad) return { ok: false, error: errorEntidad };

  const tipo = tipoDocumento.trim();
  if (!tipo || tipo.length > 120) return { ok: false, error: "Tipo de documento inválido" };

  if (!(await puedeGestionarArchivos(entidadTipo))) return { ok: false, error: "No tienes permiso para agregar carpetas" };

  const supabase = await createClient();

  if (!TIPOS_DOCUMENTO_VALIDOS.has(tipo)) {
    const { data: tipoCustom } = await supabase.from("tipos_documento_custom").select("slug").eq("slug", tipo).maybeSingle();
    if (!tipoCustom) return { ok: false, error: "Tipo de documento inválido" };
  }

  if (!(await entidadExiste(supabase, entidadTipo, entidadId))) return { ok: false, error: "No se encontró la entidad" };

  const { error } = await supabase
    .from("carpetas_vacias")
    .upsert(
      { entidad_tipo: entidadTipo, entidad_id: entidadId, contexto: "documento", valor: tipo },
      { onConflict: "entidad_tipo,entidad_id,contexto,valor", ignoreDuplicates: true }
    );
  if (error) return { ok: false, error: error.message };

  revalidarEntidad(entidadTipo, entidadId);
  return { ok: true };
}

const CARPETA_SEGMENTO_MAX = 60;
const CARPETA_SEGMENTOS_MAX = 6;

/** Mismo formato que valida `src/app/api/archivos/upload/route.ts` para `archivos.carpeta`. */
function normalizarRutaCarpeta(valor: string): string | null {
  const segmentos = valor.split("/").map((s) => s.trim()).filter(Boolean);
  if (segmentos.length === 0 || segmentos.length > CARPETA_SEGMENTOS_MAX) return null;
  for (const segmento of segmentos) {
    if (segmento.length > CARPETA_SEGMENTO_MAX) return null;
    for (let i = 0; i < segmento.length; i++) {
      const codigo = segmento.charCodeAt(i);
      if (codigo < 32 || codigo === 127) return null;
    }
  }
  return segmentos.join("/");
}

/** Crea una subcarpeta vacía (sin archivos todavía) dentro de "Archivos" — persiste aunque nunca reciba contenido. */
export async function crearCarpetaArchivo(entidadTipo: string, entidadId: string, ruta: string): Promise<ResultadoCarpeta> {
  const errorEntidad = validarEntidad(entidadTipo, entidadId);
  if (errorEntidad) return { ok: false, error: errorEntidad };

  const rutaLimpia = normalizarRutaCarpeta(ruta);
  if (!rutaLimpia) return { ok: false, error: "Nombre de carpeta inválido" };

  if (!(await puedeGestionarArchivos(entidadTipo))) return { ok: false, error: "No tienes permiso para crear carpetas" };

  const supabase = await createClient();
  if (!(await entidadExiste(supabase, entidadTipo, entidadId))) return { ok: false, error: "No se encontró la entidad" };

  const { error } = await supabase
    .from("carpetas_vacias")
    .upsert(
      { entidad_tipo: entidadTipo, entidad_id: entidadId, contexto: "archivo", valor: rutaLimpia },
      { onConflict: "entidad_tipo,entidad_id,contexto,valor", ignoreDuplicates: true }
    );
  if (error) return { ok: false, error: error.message };

  revalidarEntidad(entidadTipo, entidadId);
  return { ok: true };
}

/**
 * Mueve un archivo a otra carpeta de la misma ficha —`ruta: null` lo deja
 * suelto en la raíz—, que es lo que hace arrastrar y soltar en el panel de
 * Archivos. No toca el objeto en R2: sólo cambia la columna `carpeta`.
 */
export async function moverArchivoACarpeta(archivoId: string, ruta: string | null): Promise<ResultadoCarpeta> {
  if (!esUuid(archivoId)) return { ok: false, error: "Archivo inválido" };

  const pedidoRaiz = ruta === null || ruta.trim() === "";
  const destino = pedidoRaiz ? null : normalizarRutaCarpeta(ruta as string);
  if (!pedidoRaiz && !destino) return { ok: false, error: "Nombre de carpeta inválido" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autorizado" };

  const { data: archivo } = await supabase
    .from("archivos")
    .select("id, entidad_tipo, entidad_id, carpeta, nombre_original")
    .eq("id", archivoId)
    .maybeSingle();
  if (!archivo) return { ok: false, error: "No se encontró el archivo" };

  const entidadTipo = archivo.entidad_tipo as string;
  const entidadId = archivo.entidad_id as string;
  if (!TABLA_POR_ENTIDAD[entidadTipo]) return { ok: false, error: "Tipo de entidad inválido" };
  if (!(await puedeGestionarArchivos(entidadTipo))) return { ok: false, error: "No tienes permiso para mover archivos" };

  const origen = (archivo.carpeta as string | null) || null;
  if (origen === destino) return { ok: true };

  // Devolvemos la fila para no dar por bueno un update que RLS dejó en cero
  // filas (sin error): el panel muestra el archivo movido al instante y no
  // debe quedarse así si el servidor no lo guardó.
  const { data: actualizado, error } = await supabase
    .from("archivos")
    // La posición manual es relativa a la carpeta: en la nueva no significa
    // nada, así que el archivo entra al final.
    .update({ carpeta: destino, orden: null })
    .eq("id", archivoId)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!actualizado) return { ok: false, error: "No se pudo mover el archivo" };

  // La carpeta de origen puede quedarse sin un solo archivo y, sin marcador,
  // desaparecería del árbol al sacarle el último: le dejamos el suyo para que
  // siga ahí. Es idempotente y `eliminarCarpetaVacia` lo limpia si después se
  // borra la carpeta.
  if (origen) {
    await supabase
      .from("carpetas_vacias")
      .upsert(
        { entidad_tipo: entidadTipo, entidad_id: entidadId, contexto: "archivo", valor: origen },
        { onConflict: "entidad_tipo,entidad_id,contexto,valor", ignoreDuplicates: true }
      );
  }

  const nombre = (archivo.nombre_original as string) ?? "archivo";
  await registrarEvento(supabase, user.id, {
    tabla: TABLA_POR_ENTIDAD[entidadTipo],
    registroId: entidadId,
    accion: "editar",
    campo: "archivo",
    valorAnterior: `${nombre} — ${origen ?? "sin carpeta"}`,
    valorNuevo: `${nombre} — ${destino ?? "sin carpeta"}`,
  });

  revalidarEntidad(entidadTipo, entidadId);
  return { ok: true };
}

/** Tope de archivos por reordenamiento: una carpeta real no llega ni cerca. */
const MAX_REORDENAR = 500;

/**
 * Guarda el orden manual de los archivos de una carpeta: `ids` en el orden en
 * que deben verse, y cada uno recibe su índice en `orden`. Todos deben estar
 * hoy en la misma carpeta; los que cuelgan de un documento vinculado tienen
 * otra entidad dueña, así que el permiso se comprueba por cada una.
 */
export async function reordenarArchivos(ids: string[], carpeta: string | null): Promise<ResultadoCarpeta> {
  if (!Array.isArray(ids) || ids.length === 0) return { ok: true };
  if (ids.length > MAX_REORDENAR || new Set(ids).size !== ids.length || !ids.every(esUuid)) {
    return { ok: false, error: "Lista de archivos inválida" };
  }
  const ruta = carpeta === null || carpeta.trim() === "" ? null : normalizarRutaCarpeta(carpeta);
  if (carpeta !== null && carpeta.trim() !== "" && !ruta) return { ok: false, error: "Nombre de carpeta inválido" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autorizado" };

  const { data: filas, error: errorLectura } = await supabase
    .from("archivos")
    .select("id, entidad_tipo, entidad_id, carpeta")
    .in("id", ids);
  if (errorLectura) return { ok: false, error: errorLectura.message };
  if (!filas || filas.length !== ids.length) return { ok: false, error: "No se encontraron todos los archivos" };
  if (filas.some((fila) => ((fila.carpeta as string | null) || null) !== ruta)) {
    return { ok: false, error: "Los archivos ya no están en esa carpeta; recarga la página" };
  }

  const tipos = Array.from(new Set(filas.map((fila) => fila.entidad_tipo as string)));
  for (const tipo of tipos) {
    if (!TABLA_POR_ENTIDAD[tipo]) return { ok: false, error: "Tipo de entidad inválido" };
    if (!(await puedeGestionarArchivos(tipo))) return { ok: false, error: "No tienes permiso para ordenar archivos" };
  }

  // Igual que al mover: se pide la fila de vuelta para no dar por bueno un
  // update que RLS dejó en cero filas sin error.
  const resultados = await Promise.all(ids.map((id, orden) =>
    supabase.from("archivos").update({ orden }).eq("id", id).select("id").maybeSingle()
  ));
  if (resultados.some(({ error, data }) => error || !data)) return { ok: false, error: "No se pudo guardar el orden" };

  for (const clave of new Set(filas.map((fila) => `${fila.entidad_tipo}:${fila.entidad_id}`))) {
    const [tipo, id] = clave.split(":");
    revalidarEntidad(tipo, id);
  }
  return { ok: true };
}

/**
 * Cambia la ruta de una carpeta entera y arrastra con ella todo lo que cuelga
 * abajo: archivos, subcarpetas y sus marcadores. Es la misma operación para
 * mover (cambia el padre) y para renombrar (cambia el último segmento), porque
 * en este modelo la carpeta ES su ruta.
 */
export async function reubicarCarpeta(
  entidadTipo: string,
  entidadId: string,
  rutaOrigen: string,
  rutaDestino: string,
  /**
   * Archivos que el panel muestra dentro de esta carpeta pero que cuelgan de
   * OTRA ficha (los de documentos vinculados). Sin ellos, renombrar la carpeta
   * dejaría atrás justo esos y la carpeta vieja reaparecería a medias.
   */
  archivosVinculados: string[] = []
): Promise<ResultadoCarpeta> {
  const errorEntidad = validarEntidad(entidadTipo, entidadId);
  if (errorEntidad) return { ok: false, error: errorEntidad };

  const origen = normalizarRutaCarpeta(rutaOrigen);
  const destino = normalizarRutaCarpeta(rutaDestino);
  if (!origen || !destino) return { ok: false, error: "Nombre de carpeta inválido" };
  if (origen === destino) return { ok: true };
  // Meter una carpeta en su propia descendencia dejaría una rama colgando de
  // una ruta que ya no existe (y un bucle en el árbol al reescribir).
  if (destino.startsWith(`${origen}/`)) return { ok: false, error: "No puedes mover una carpeta dentro de sí misma" };

  if (!(await puedeGestionarArchivos(entidadTipo))) return { ok: false, error: "No tienes permiso para mover carpetas" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autorizado" };
  if (!(await entidadExiste(supabase, entidadTipo, entidadId))) return { ok: false, error: "No se encontró la entidad" };

  const dentroDelOrigen = (ruta: string | null | undefined): ruta is string =>
    Boolean(ruta) && (ruta === origen || (ruta as string).startsWith(`${origen}/`));
  const reescribir = (ruta: string) => `${destino}${ruta.slice(origen.length)}`;

  const [{ data: archivos, error: errorArchivos }, { data: marcadores, error: errorMarcadores }] = await Promise.all([
    supabase
      .from("archivos")
      .select("id, carpeta")
      .eq("entidad_tipo", entidadTipo)
      .eq("entidad_id", entidadId)
      .not("carpeta", "is", null),
    supabase
      .from("carpetas_vacias")
      .select("valor")
      .eq("entidad_tipo", entidadTipo)
      .eq("entidad_id", entidadId)
      .eq("contexto", "archivo"),
  ]);
  if (errorArchivos) return { ok: false, error: errorArchivos.message };
  if (errorMarcadores) return { ok: false, error: errorMarcadores.message };

  const archivosAfectados = (archivos ?? []).filter((fila) => dentroDelOrigen(fila.carpeta as string | null));
  const marcadoresAfectados = (marcadores ?? [])
    .map((fila) => fila.valor as string)
    .filter((valor) => dentroDelOrigen(valor));

  // Archivos de fichas vinculadas que se ven dentro de esta carpeta: cada uno
  // se comprueba contra su propia entidad, nunca contra la del panel.
  const idsVinculados = Array.from(new Set(archivosVinculados.filter(esUuid))).slice(0, 500);
  if (idsVinculados.length > 0) {
    // En lotes: hasta 500 ids no entran en la URL de un solo `.in()` (~396).
    const { data: foraneos, error: errorForaneos } = await fetchAllRowsIn(idsVinculados, (lote, desde, hasta) => supabase
      .from("archivos")
      .select("id, carpeta, entidad_tipo")
      .in("id", lote)
      .order("id")
      .range(desde, hasta));
    if (errorForaneos) return { ok: false, error: errorForaneos.message };

    const yaContados = new Set(archivosAfectados.map((fila) => fila.id as string));
    for (const tipo of new Set((foraneos ?? []).map((fila) => fila.entidad_tipo as string))) {
      if (!TABLA_POR_ENTIDAD[tipo] || !(await puedeGestionarArchivos(tipo))) {
        return { ok: false, error: "No tienes permiso para mover alguno de estos archivos" };
      }
    }
    for (const fila of foraneos ?? []) {
      if (yaContados.has(fila.id as string)) continue;
      if (!dentroDelOrigen(fila.carpeta as string | null)) continue;
      archivosAfectados.push({ id: fila.id, carpeta: fila.carpeta });
    }
  }

  // Dos carpetas hermanas no pueden llamarse igual: la ruta ES su identidad, así
  // que fusionarlas en silencio mezclaría contenido que nadie pidió juntar.
  const rutasExistentes = new Set<string>([
    ...(archivos ?? []).map((fila) => fila.carpeta as string).filter(Boolean),
    ...(marcadores ?? []).map((fila) => fila.valor as string),
  ]);
  for (const ruta of rutasExistentes) {
    if (ruta === destino || ruta.startsWith(`${destino}/`)) {
      return { ok: false, error: `Ya hay una carpeta "${destino.split("/").pop()}" ahí` };
    }
  }

  // La rama más honda no puede pasarse del máximo de niveles al colgar del
  // nuevo padre; si no, quedaría fuera de lo que acepta el resto del sistema.
  const rutasActuales = new Set<string>([origen, ...marcadoresAfectados]);
  for (const fila of archivosAfectados) rutasActuales.add(fila.carpeta as string);
  for (const ruta of rutasActuales) {
    if (reescribir(ruta).split("/").length > CARPETA_SEGMENTOS_MAX) {
      return { ok: false, error: `La carpeta quedaría a más de ${CARPETA_SEGMENTOS_MAX} niveles` };
    }
  }

  // Un update por ruta destino: cada subcarpeta conserva su propio tramo.
  const porDestino = new Map<string, string[]>();
  for (const fila of archivosAfectados) {
    const nueva = reescribir(fila.carpeta as string);
    porDestino.set(nueva, [...(porDestino.get(nueva) ?? []), fila.id as string]);
  }
  for (const [nueva, ids] of porDestino) {
    for (let i = 0; i < ids.length; i += 100) {
      const { error } = await supabase.from("archivos").update({ carpeta: nueva }).in("id", ids.slice(i, i + 100));
      if (error) return { ok: false, error: error.message };
    }
  }

  // El marcador del destino va siempre: sin él, una carpeta que se movió sin
  // archivos dentro no tendría nada que la mantenga visible.
  const nuevosMarcadores = Array.from(new Set([destino, ...marcadoresAfectados.map(reescribir)]));
  const { error: errorAlta } = await supabase.from("carpetas_vacias").upsert(
    nuevosMarcadores.map((valor) => ({ entidad_tipo: entidadTipo, entidad_id: entidadId, contexto: "archivo", valor })),
    { onConflict: "entidad_tipo,entidad_id,contexto,valor", ignoreDuplicates: true }
  );
  if (errorAlta) return { ok: false, error: errorAlta.message };

  if (marcadoresAfectados.length > 0) {
    const { error } = await supabase
      .from("carpetas_vacias")
      .delete()
      .eq("entidad_tipo", entidadTipo)
      .eq("entidad_id", entidadId)
      .eq("contexto", "archivo")
      .in("valor", marcadoresAfectados);
    if (error) return { ok: false, error: error.message };
  }

  await registrarEvento(supabase, user.id, {
    tabla: TABLA_POR_ENTIDAD[entidadTipo],
    registroId: entidadId,
    accion: "editar",
    campo: "carpeta",
    valorAnterior: origen,
    valorNuevo: destino,
  });

  revalidarEntidad(entidadTipo, entidadId);
  return { ok: true };
}

/**
 * Quita el marcador de una carpeta vacía: la categoría o subcarpeta deja de
 * mostrarse en cuanto no le queda ni contenido real ni marcador. Para
 * `contexto: "archivo"` también quita los marcadores de sus subcarpetas
 * (mismo alcance que borrar la carpeta con contenido).
 */
export async function eliminarCarpetaVacia(
  entidadTipo: string,
  entidadId: string,
  contexto: "documento" | "archivo",
  valor: string
): Promise<ResultadoCarpeta> {
  const errorEntidad = validarEntidad(entidadTipo, entidadId);
  if (errorEntidad) return { ok: false, error: errorEntidad };
  if (!(await puedeGestionarArchivos(entidadTipo))) return { ok: false, error: "No tienes permiso para eliminar carpetas" };

  const supabase = await createClient();
  const valorLimpio = contexto === "archivo" ? normalizarRutaCarpeta(valor) : valor.trim();
  if (!valorLimpio) return { ok: false, error: "Carpeta inválida" };

  if (contexto === "archivo") {
    // No usamos LIKE con el valor recibido: `%` y `_` son caracteres
    // válidos en un nombre de carpeta y funcionarían como comodines,
    // pudiendo borrar marcadores hermanos por accidente.
    const { data: marcadores, error: errorLectura } = await supabase
      .from("carpetas_vacias")
      .select("valor")
      .eq("entidad_tipo", entidadTipo)
      .eq("entidad_id", entidadId)
      .eq("contexto", "archivo");
    if (errorLectura) return { ok: false, error: errorLectura.message };

    const rutas = (marcadores ?? [])
      .map((fila) => fila.valor)
      .filter((ruta) => ruta === valorLimpio || ruta.startsWith(`${valorLimpio}/`));
    if (rutas.length > 0) {
      const { error } = await supabase
        .from("carpetas_vacias")
        .delete()
        .eq("entidad_tipo", entidadTipo)
        .eq("entidad_id", entidadId)
        .eq("contexto", "archivo")
        .in("valor", rutas);
      if (error) return { ok: false, error: error.message };
    }
  } else {
    const { error } = await supabase
    .from("carpetas_vacias")
    .delete()
    .eq("entidad_tipo", entidadTipo)
    .eq("entidad_id", entidadId)
    .eq("contexto", contexto)
      .eq("valor", valorLimpio);
    if (error) return { ok: false, error: error.message };
  }

  revalidarEntidad(entidadTipo, entidadId);
  return { ok: true };
}
