"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { puedeAdministrarEntidad } from "@/lib/auth/perfil";
import { esUuid } from "@/lib/contratos/adendas";
import { TIPOS_DOCUMENTO_VALIDOS } from "@/lib/relaciones/agrupar";
import { registrarEvento, TABLA_POR_ENTIDAD } from "@/lib/historial-server";
import { mandarAPapelera } from "@/lib/papelera-server";
import { esFechaISOValida } from "@/lib/utils";

export type ResultadoDocumento =
  | { ok: true; documentoId: string }
  | { ok: false; error: string };

export type ResultadoSimple = { ok: true } | { ok: false; error: string };

const NOMBRE_MAX = 240;

/** Tipos de entidad que pueden ser dueñas de un documento nuevo desde este flujo. */
const ENTIDADES_DUENAS: Record<string, string> = {
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

/**
 * Crea un documento nuevo (fila en `documentos`, con el `tipo` de la
 * categoría donde se agrega) y lo vincula a la entidad dueña de la ficha
 * desde la que se creó — mismo patrón `origen_tipo/origen_id/destino_tipo/
 * destino_id` que usa el resto de la migración. El archivo en sí se sube
 * aparte, con `subirArchivo` contra `entidadTipo: "documento"` y el id que
 * devuelve esta acción.
 */
export async function crearDocumentoEnCategoria(entrada: {
  entidadTipo: string;
  entidadId: string;
  tipoDocumento: string;
  nombre: string;
  fecha?: string | null;
}): Promise<ResultadoDocumento> {
  const rutaLista = ENTIDADES_DUENAS[entrada.entidadTipo];
  if (!rutaLista) return { ok: false, error: "Tipo de entidad inválido" };
  if (!esUuid(entrada.entidadId)) return { ok: false, error: "Entidad inválida" };

  const tipoDocumento = entrada.tipoDocumento.trim();
  if (!tipoDocumento || tipoDocumento.length > 120) return { ok: false, error: "Tipo de documento inválido" };

  const nombreLimpio = entrada.nombre.trim().replace(/\s+/g, " ");
  if (!nombreLimpio) return { ok: false, error: "Escribe un nombre para el documento" };
  if (nombreLimpio.length > NOMBRE_MAX) return { ok: false, error: `El nombre no puede pasar de ${NOMBRE_MAX} caracteres` };

  const fechaEntrada = entrada.fecha?.trim() ?? "";
  if (fechaEntrada && !esFechaISOValida(fechaEntrada)) {
    return { ok: false, error: "Fecha de documento inválida" };
  }
  const fecha = fechaEntrada || null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión expirada. Vuelve a iniciar sesión." };

  if (!await puedeAdministrarEntidad("documento")) return { ok: false, error: "Tu rol no permite agregar documentos" };

  if (!TIPOS_DOCUMENTO_VALIDOS.has(tipoDocumento)) {
    const { data: tipoCustom } = await supabase
      .from("tipos_documento_custom")
      .select("slug")
      .eq("slug", tipoDocumento)
      .maybeSingle();
    if (!tipoCustom) return { ok: false, error: "Tipo de documento inválido" };
  }

  const { data: dueno } = await supabase
    .from(tablaDe(entrada.entidadTipo))
    .select("id")
    .eq("id", entrada.entidadId)
    .maybeSingle();
  if (!dueno) return { ok: false, error: "No se encontró la entidad dueña" };

  const { data: creado, error: errorInsercion } = await supabase
    .from("documentos")
    .insert({
      tipo: tipoDocumento,
      nombre: nombreLimpio.slice(0, NOMBRE_MAX),
      fecha,
      extra: { origen: "app" },
    })
    .select("id")
    .single();

  if (errorInsercion || !creado) {
    return { ok: false, error: errorInsercion?.message ?? "No se pudo crear el documento" };
  }

  const { error: errorVinculo } = await supabase.from("vinculos").insert({
    origen_tipo: entrada.entidadTipo,
    origen_id: entrada.entidadId,
    destino_tipo: "documento",
    destino_id: creado.id,
    rol: null,
    resuelto_por: "manual",
  });
  // Si el vínculo falla no se revierte la fila del documento: en el peor
  // caso queda huérfano del panel (visible igual desde /documentos) y se
  // puede re-vincular a mano; no vale la pena una transacción para esto.
  if (errorVinculo) {
    return { ok: false, error: `Documento creado, pero no se pudo vincular: ${errorVinculo.message}` };
  }

  const tablaDuena = TABLA_POR_ENTIDAD[entrada.entidadTipo];
  if (tablaDuena) {
    await registrarEvento(supabase, user.id, {
      tabla: tablaDuena,
      registroId: entrada.entidadId,
      accion: "crear",
      campo: "vinculo",
      valorNuevo: nombreLimpio.slice(0, NOMBRE_MAX),
    });
  }

  revalidarDocumentos(entrada.entidadTipo, entrada.entidadId, rutaLista);
  return { ok: true, documentoId: creado.id };
}

/**
 * Manda a la papelera un documento creado desde la app. Reversible: sus
 * archivos y sus `vinculos` se conservan, y la política "ocultar_eliminados"
 * (migración 20260831000300) lo esconde de las listas y de las fichas de sus
 * entidades dueñas hasta que se restaure. Los documentos migrados de Notion
 * (sin `extra.origen === "app"`) no se tocan desde aquí.
 */
export async function eliminarDocumento(documentoId: string): Promise<ResultadoSimple> {
  if (!esUuid(documentoId)) return { ok: false, error: "Documento inválido" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión expirada. Vuelve a iniciar sesión." };

  if (!await puedeAdministrarEntidad("documento")) return { ok: false, error: "Tu rol no permite eliminar documentos" };

  const { data: documento } = await supabase
    .from("documentos")
    .select("id, nombre, extra")
    .eq("id", documentoId)
    .maybeSingle();
  if (!documento) return { ok: false, error: "No se encontró el documento" };

  const origen = (documento.extra as { origen?: string } | null)?.origen;
  if (origen !== "app") {
    return { ok: false, error: "Sólo se pueden eliminar documentos creados desde la aplicación" };
  }

  // Entidades dueñas, para anotar la baja en su historial. Los vínculos se
  // conservan: son lo que hace que restaurar devuelva el documento a la
  // ficha de la que colgaba.
  const filtroVinculo =
    `and(origen_tipo.eq.documento,origen_id.eq.${documentoId}),` +
    `and(destino_tipo.eq.documento,destino_id.eq.${documentoId})`;
  const { data: vinculos } = await supabase
    .from("vinculos")
    .select("origen_tipo, origen_id, destino_tipo, destino_id")
    .or(filtroVinculo);

  const baja = await mandarAPapelera(supabase, "documentos", documentoId);
  if (!baja.ok) return baja;

  const duenas = (vinculos ?? []).map((v) => {
    const esOrigen = v.origen_tipo === "documento" && v.origen_id === documentoId;
    return { tipo: esOrigen ? v.destino_tipo : v.origen_tipo, id: esOrigen ? v.destino_id : v.origen_id };
  });

  for (const duena of duenas) {
    const tabla = TABLA_POR_ENTIDAD[duena.tipo];
    if (!tabla) continue;
    await registrarEvento(supabase, user.id, {
      tabla,
      registroId: duena.id,
      accion: "eliminar",
      campo: "vinculo",
      valorAnterior: documento.nombre ?? null,
    });
  }

  revalidatePath("/documentos");
  revalidatePath(`/documentos/${documentoId}`);
  for (const duena of duenas) {
    const rutaLista = ENTIDADES_DUENAS[duena.tipo];
    if (!rutaLista) continue;
    revalidatePath(rutaLista);
    revalidatePath(`${rutaLista}/${duena.id}`);
  }

  return { ok: true };
}

function tablaDe(entidadTipo: string): string {
  const tablas: Record<string, string> = {
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
  return tablas[entidadTipo] ?? entidadTipo;
}

function revalidarDocumentos(entidadTipo: string, entidadId: string, rutaLista: string) {
  revalidatePath(rutaLista);
  revalidatePath(`${rutaLista}/${entidadId}`);
}
