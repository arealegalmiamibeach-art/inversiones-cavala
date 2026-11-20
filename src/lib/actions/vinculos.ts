"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { puedeAdministrarEntidad } from "@/lib/auth/perfil";
import { esUuid } from "@/lib/contratos/adendas";
import { registrarEvento, TABLA_POR_ENTIDAD } from "@/lib/historial-server";
import { ENTIDAD_INFO, esEntidadRelacionable, filtroParEntidades } from "@/lib/vinculos-server";

export type TipoRelacionProceso = "propietario" | "predio" | "vehiculo";

type ResultadoVinculo = { ok: true } | { ok: false; error: string };

/**
 * Un vínculo cambia las DOS fichas —aparece en el panel de relaciones de cada
 * una y deja un evento en el historial de ambas— así que hace falta permiso de
 * escritura en los dos extremos, no sólo en aquel desde el que se pulsó el
 * botón. Con la comprobación de un solo lado, alguien con acceso únicamente a
 * Vehículos podía escribir en el historial de un proceso judicial que ni
 * siquiera puede ver.
 */
async function puedeVincularAmbos(tipoA: string, tipoB: string): Promise<boolean> {
  return (await puedeAdministrarEntidad(tipoA)) && (await puedeAdministrarEntidad(tipoB));
}

const ERROR_PERMISO = "Tu rol no permite modificar relaciones entre estos dos registros";

const DESTINOS: Record<TipoRelacionProceso, { tabla: string; nombreCampo: string; ruta: string; label: string }> = {
  propietario: {
    tabla: "propietarios",
    nombreCampo: "nombre",
    ruta: "/entidades/propietarios",
    label: "Propietario",
  },
  predio: {
    tabla: "predios",
    nombreCampo: "nombre",
    ruta: "/entidades/predios",
    label: "Predio",
  },
  vehiculo: {
    tabla: "vehiculos",
    nombreCampo: "placa",
    ruta: "/entidades/vehiculos",
    label: "Vehículo",
  },
};

function esTipoDestino(valor: string): valor is TipoRelacionProceso {
  return Object.prototype.hasOwnProperty.call(DESTINOS, valor);
}

function filtroPar(procesoId: string, destinoTipo: TipoRelacionProceso, destinoId: string) {
  return [
    `and(origen_tipo.eq.proceso,origen_id.eq.${procesoId},destino_tipo.eq.${destinoTipo},destino_id.eq.${destinoId})`,
    `and(origen_tipo.eq.${destinoTipo},origen_id.eq.${destinoId},destino_tipo.eq.proceso,destino_id.eq.${procesoId})`,
  ].join(",");
}

async function contextoValido(procesoId: string, destinoTipo: string, destinoId: string) {
  if (!esUuid(procesoId) || !esUuid(destinoId) || !esTipoDestino(destinoTipo)) {
    return { ok: false as const, error: "Relación no válida" };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sesión expirada. Vuelve a iniciar sesión." };

  if (!await puedeVincularAmbos("proceso", destinoTipo)) {
    return { ok: false as const, error: ERROR_PERMISO };
  }

  const destino = DESTINOS[destinoTipo];
  const [{ data: proceso }, { data: registroDestino }] = await Promise.all([
    supabase.from("procesos").select("id, expediente").eq("id", procesoId).maybeSingle(),
    supabase
      .from(destino.tabla)
      .select(`id, ${destino.nombreCampo}`)
      .eq("id", destinoId)
      .maybeSingle(),
  ]);

  if (!proceso) return { ok: false as const, error: "No se encontró el proceso" };
  if (!registroDestino) return { ok: false as const, error: `No se encontró el ${destino.label.toLocaleLowerCase("es-PE")}` };

  const filaDestino = registroDestino as unknown as Record<string, string | null>;
  const nombreDestino = filaDestino[destino.nombreCampo]?.trim() || destino.label;
  return { ok: true as const, supabase, user, destino, nombreDestino };
}

/** Vincula un proceso con un registro patrimonial existente. */
export async function vincularProceso(
  procesoId: string,
  destinoTipo: string,
  destinoId: string
): Promise<ResultadoVinculo> {
  const contexto = await contextoValido(procesoId, destinoTipo, destinoId);
  if (!contexto.ok) return contexto;

  const tipo = destinoTipo as TipoRelacionProceso;
  const { data: existente } = await contexto.supabase
    .from("vinculos")
    .select("id")
    .or(filtroPar(procesoId, tipo, destinoId))
    .limit(1)
    .maybeSingle();

  // Repetir la misma selección desde dos vistas es una operación idempotente.
  if (existente) return { ok: true };

  const { error } = await contexto.supabase.from("vinculos").insert({
    origen_tipo: "proceso",
    origen_id: procesoId,
    destino_tipo: tipo,
    destino_id: destinoId,
    rol: null,
    resuelto_por: "manual",
  });
  if (error) {
    if (error.code === "23505") return { ok: true };
    return { ok: false, error: error.message || "No se pudo crear la relación" };
  }

  await registrarHistorial(contexto.supabase, contexto.user.id, procesoId, tipo, destinoId, "crear", contexto.nombreDestino);
  revalidarRelacion(procesoId, tipo, destinoId);
  return { ok: true };
}

/** Elimina el par en ambos sentidos para limpiar duplicados heredados de Notion. */
export async function desvincularProceso(
  procesoId: string,
  destinoTipo: string,
  destinoId: string
): Promise<ResultadoVinculo> {
  const contexto = await contextoValido(procesoId, destinoTipo, destinoId);
  if (!contexto.ok) return contexto;

  const tipo = destinoTipo as TipoRelacionProceso;
  const { data: borrados, error } = await contexto.supabase
    .from("vinculos")
    .delete()
    .or(filtroPar(procesoId, tipo, destinoId))
    .select("id");

  if (error) return { ok: false, error: error.message || "No se pudo quitar la relación" };

  // Si ya no estaba, no hay baja que anotar en el historial de ninguna de las dos fichas.
  if (borrados && borrados.length > 0) {
    await registrarHistorial(contexto.supabase, contexto.user.id, procesoId, tipo, destinoId, "eliminar", contexto.nombreDestino);
  }
  revalidarRelacion(procesoId, tipo, destinoId);
  return { ok: true };
}

async function registrarHistorial(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  procesoId: string,
  destinoTipo: TipoRelacionProceso,
  destinoId: string,
  accion: "crear" | "eliminar",
  nombreDestino: string
) {
  const destino = DESTINOS[destinoTipo];
  const valor = `${destino.label}: ${nombreDestino}`;
  await Promise.all([
    registrarEvento(supabase, userId, {
      tabla: "procesos",
      registroId: procesoId,
      accion,
      campo: "vinculo",
      ...(accion === "crear" ? { valorNuevo: valor } : { valorAnterior: valor }),
    }),
    registrarEvento(supabase, userId, {
      tabla: TABLA_POR_ENTIDAD[destinoTipo],
      registroId: destinoId,
      accion,
      campo: "vinculo",
      ...(accion === "crear" ? { valorNuevo: "Proceso judicial" } : { valorAnterior: "Proceso judicial" }),
    }),
  ]);
}

function revalidarRelacion(procesoId: string, destinoTipo: TipoRelacionProceso, destinoId: string) {
  const destino = DESTINOS[destinoTipo];
  revalidatePath("/procesos");
  revalidatePath("/procesos/materia/[materia]", "page");
  revalidatePath(`/procesos/${procesoId}`);
  revalidatePath(destino.ruta);
  revalidatePath(`${destino.ruta}/${destinoId}`);
  revalidatePath("/dashboard");
}

// ─── Vincular y desvincular entre dos entidades cualquiera (panel "Documentos y relaciones") ───
// `ENTIDAD_INFO`, `esEntidadRelacionable` y `filtroParEntidades` viven en
// `lib/vinculos-server.ts`: este archivo es "use server" y todo lo que declara
// aquí y exporta se publicaría como endpoint.

/**
 * Crea el vínculo entre dos entidades cualquiera (predio, vehículo,
 * propietario, personal, concesión, oficina registral, proceso), desde el
 * botón "+" del panel "Documentos y relaciones" de cualquiera de las dos —
 * ya sea para seleccionar un registro existente o tras crear uno nuevo.
 * Idempotente: repetir la misma selección no duplica el par.
 */
export async function vincularRelacion(
  tipoA: string,
  idA: string,
  tipoB: string,
  idB: string,
  rol?: string | null
): Promise<ResultadoVinculo> {
  if (rol != null && (typeof rol !== "string" || !rol.trim() || rol.length > 120)) return { ok: false, error: "Rol no válido" };
  if (!esUuid(idA) || !esUuid(idB) || !esEntidadRelacionable(tipoA) || !esEntidadRelacionable(tipoB)) {
    return { ok: false, error: "Relación no válida" };
  }
  if (tipoA === tipoB && idA === idB) {
    return { ok: false, error: "No puedes vincular un registro consigo mismo" };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión expirada. Vuelve a iniciar sesión." };

  if (!(await puedeVincularAmbos(tipoA, tipoB))) {
    return { ok: false, error: ERROR_PERMISO };
  }

  const infoA = ENTIDAD_INFO[tipoA];
  const infoB = ENTIDAD_INFO[tipoB];
  const [{ data: registroA }, { data: registroB }] = await Promise.all([
    supabase.from(infoA.tabla).select(`id, ${infoA.nombreCampo}`).eq("id", idA).maybeSingle(),
    supabase.from(infoB.tabla).select(`id, ${infoB.nombreCampo}`).eq("id", idB).maybeSingle(),
  ]);
  if (!registroA || !registroB) return { ok: false, error: "No se encontró el registro" };

  let consultaExistente = supabase
    .from("vinculos")
    .select("id")
    .or(filtroParEntidades(tipoA, idA, tipoB, idB));
  if (rol === null) consultaExistente = consultaExistente.is("rol", null);
  else if (rol !== undefined) consultaExistente = consultaExistente.eq("rol", rol);
  const { data: existente, error: errorExistente } = await consultaExistente.limit(1).maybeSingle();
  if (errorExistente) return { ok: false, error: errorExistente.message };

  // Repetir un vínculo que ya existe es idempotente: no se inserta ni se anota
  // otra vez en el historial de las dos fichas.
  if (existente) return { ok: true };

  const { error } = await supabase.from("vinculos").insert({
    origen_tipo: tipoA,
    origen_id: idA,
    destino_tipo: tipoB,
    destino_id: idB,
    rol: rol ?? null,
    resuelto_por: "manual",
  });
  if (error) {
    if (error.code === "23505") return { ok: true };
    return { ok: false, error: error.message || "No se pudo crear la relación" };
  }

  const filaA = registroA as unknown as Record<string, string | null>;
  const filaB = registroB as unknown as Record<string, string | null>;
  const nombreA = filaA[infoA.nombreCampo]?.trim() || infoA.label;
  const nombreB = filaB[infoB.nombreCampo]?.trim() || infoB.label;
  await Promise.all([
    registrarEvento(supabase, user.id, {
      tabla: TABLA_POR_ENTIDAD[tipoA],
      registroId: idA,
      accion: "crear",
      campo: "vinculo",
      valorNuevo: `${infoB.label}: ${nombreB}`,
    }),
    registrarEvento(supabase, user.id, {
      tabla: TABLA_POR_ENTIDAD[tipoB],
      registroId: idB,
      accion: "crear",
      campo: "vinculo",
      valorNuevo: `${infoA.label}: ${nombreA}`,
    }),
  ]);

  revalidatePath(infoA.ruta(idA));
  revalidatePath(infoB.ruta(idB));
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Quita el vínculo entre dos entidades cualquiera (predio, vehículo,
 * propietario, personal, concesión, oficina registral, proceso, documento,
 * contrato), en ambos sentidos, desde la ficha de cualquiera de las dos. No
 * borra ningún registro — sólo el par en `vinculos` — así que un documento o
 * contrato desvinculado sigue existiendo (accesible desde /documentos o
 * /contratos), sólo deja de listarse en esta ficha. Requiere permiso de
 * escritura sobre ambos extremos; un rol explícito limita la baja a ese rol.
 */
export async function desvincularRelacion(
  tipoA: string,
  idA: string,
  tipoB: string,
  idB: string,
  rol?: string | null
): Promise<ResultadoVinculo> {
  if (rol != null && (typeof rol !== "string" || !rol.trim() || rol.length > 120)) return { ok: false, error: "Rol no válido" };
  if (!esUuid(idA) || !esUuid(idB) || !esEntidadRelacionable(tipoA) || !esEntidadRelacionable(tipoB)) {
    return { ok: false, error: "Relación no válida" };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión expirada. Vuelve a iniciar sesión." };

  if (!(await puedeVincularAmbos(tipoA, tipoB))) {
    return { ok: false, error: ERROR_PERMISO };
  }

  const infoA = ENTIDAD_INFO[tipoA];
  const infoB = ENTIDAD_INFO[tipoB];
  const [{ data: registroA }, { data: registroB }] = await Promise.all([
    supabase.from(infoA.tabla).select(`id, ${infoA.nombreCampo}`).eq("id", idA).maybeSingle(),
    supabase.from(infoB.tabla).select(`id, ${infoB.nombreCampo}`).eq("id", idB).maybeSingle(),
  ]);
  if (!registroA || !registroB) return { ok: false, error: "No se encontró el registro" };

  let consultaBaja = supabase
    .from("vinculos")
    .delete()
    .or(filtroParEntidades(tipoA, idA, tipoB, idB));
  if (rol === null) consultaBaja = consultaBaja.is("rol", null);
  else if (rol !== undefined) consultaBaja = consultaBaja.eq("rol", rol);
  const { data: borrados, error } = await consultaBaja.select("id");
  if (error) return { ok: false, error: error.message || "No se pudo quitar la relación" };
  // Ya no estaba (otra pestaña lo quitó antes): nada que anotar en el historial.
  if (!borrados || borrados.length === 0) {
    revalidatePath(ENTIDAD_INFO[tipoA].ruta(idA));
    revalidatePath(ENTIDAD_INFO[tipoB].ruta(idB));
    return { ok: true };
  }

  const filaA = registroA as unknown as Record<string, string | null>;
  const filaB = registroB as unknown as Record<string, string | null>;
  const nombreA = filaA[infoA.nombreCampo]?.trim() || infoA.label;
  const nombreB = filaB[infoB.nombreCampo]?.trim() || infoB.label;
  await Promise.all([
    registrarEvento(supabase, user.id, {
      tabla: TABLA_POR_ENTIDAD[tipoA],
      registroId: idA,
      accion: "eliminar",
      campo: "vinculo",
      valorAnterior: `${infoB.label}: ${nombreB}`,
    }),
    registrarEvento(supabase, user.id, {
      tabla: TABLA_POR_ENTIDAD[tipoB],
      registroId: idB,
      accion: "eliminar",
      campo: "vinculo",
      valorAnterior: `${infoA.label}: ${nombreA}`,
    }),
  ]);

  revalidatePath(infoA.ruta(idA));
  revalidatePath(infoB.ruta(idB));
  revalidatePath("/", "layout");
  return { ok: true };
}
