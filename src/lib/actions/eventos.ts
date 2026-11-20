"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { puedeAdministrarEntidad } from "@/lib/auth/perfil";
import { esUuid } from "@/lib/contratos/adendas";
import {
  componerIniciaEn,
  descomponerIniciaEn,
  esEstadoDiligencia,
  type EstadoDiligencia,
} from "@/lib/procesos/eventos";
import { mandarAPapelera } from "@/lib/papelera-server";
import { esFechaISOValida, esHoraISOValida } from "@/lib/utils";

/**
 * Alta, edición y baja de diligencias/audiencias (tabla `eventos`), enlazadas
 * opcionalmente a un proceso por `vinculos`. Reemplaza el "no se puede crear
 * una diligencia desde la app": hasta ahora sólo se leían fechas detectadas
 * con regex en el texto libre del expediente.
 */

export type ResultadoEvento = { ok: true; id: string } | { ok: false; error: string };
export type ResultadoSimple = { ok: true } | { ok: false; error: string };

function limpiar(valor: unknown, max: number): string | null {
  if (typeof valor !== "string") return null;
  const texto = valor.trim().replace(/\s+/g, " ");
  if (!texto) return null;
  return texto.slice(0, max);
}

type EntradaEvento = {
  procesoId?: string | null;
  titulo?: string | null;
  fecha?: string | null;
  hora?: string | null;
  tipo_diligencia?: string | null;
  responsable?: string | null;
  responsable_id?: string | null;
  dias_aviso?: number | null;
  notificar?: boolean;
};

/** Anticipación del aviso: fuera de rango se recorta en vez de fallar el alta. */
function diasAviso(valor: unknown): number {
  const numero = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(numero)) return 10;
  return Math.min(90, Math.max(0, Math.round(numero)));
}

export async function crearEvento(entrada: EntradaEvento): Promise<ResultadoEvento> {
  const fecha = typeof entrada.fecha === "string" ? entrada.fecha.trim() : "";
  if (!esFechaISOValida(fecha)) return { ok: false, error: "Elige una fecha válida" };

  const hora = entrada.hora?.trim() || null;
  if (hora && !esHoraISOValida(hora)) return { ok: false, error: "La hora no es válida" };

  if (entrada.procesoId != null && !esUuid(entrada.procesoId)) {
    return { ok: false, error: "Proceso no válido" };
  }

  if (entrada.responsable_id != null && !esUuid(entrada.responsable_id)) {
    return { ok: false, error: "Responsable no válido" };
  }

  const tipo = limpiar(entrada.tipo_diligencia, 120);
  const titulo = limpiar(entrada.titulo, 240) ?? tipo ?? "Diligencia";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión expirada. Vuelve a iniciar sesión." };

  if (!await puedeAdministrarEntidad("evento")) return { ok: false, error: "Tu rol no permite registrar diligencias" };

  if (entrada.procesoId) {
    const { data: proceso } = await supabase.from("procesos").select("id").eq("id", entrada.procesoId).maybeSingle();
    if (!proceso) return { ok: false, error: "No se encontró el proceso" };
  }

  const { data: creado, error } = await supabase
    .from("eventos")
    .insert({
      titulo,
      inicia_en: componerIniciaEn(fecha, hora),
      tipo_diligencia: tipo,
      responsable: limpiar(entrada.responsable, 120),
      responsable_id: entrada.responsable_id ?? null,
      dias_aviso: diasAviso(entrada.dias_aviso),
      estado: "PENDIENTE",
      notificar: entrada.notificar ?? true,
      notion_origen: "MANUAL",
      extra: { origen: "app" },
    })
    .select("id")
    .single();

  if (error || !creado) {
    if (error?.code === "42501") return { ok: false, error: "Sin permiso para registrar diligencias" };
    return { ok: false, error: error?.message ?? "No se pudo registrar la diligencia" };
  }

  if (entrada.procesoId) {
    const { error: errorVinculo } = await supabase.from("vinculos").insert({
      origen_tipo: "proceso",
      origen_id: entrada.procesoId,
      destino_tipo: "evento",
      destino_id: creado.id,
      rol: null,
      resuelto_por: "manual",
    });
    if (errorVinculo) {
      return { ok: false, error: `Diligencia creada, pero no se pudo enlazar al proceso: ${errorVinculo.message}` };
    }
  }

  revalidar(entrada.procesoId);
  return { ok: true, id: creado.id as string };
}

type EdicionEvento = {
  titulo?: string | null;
  fecha?: string | null;
  hora?: string | null;
  tipo_diligencia?: string | null;
  responsable?: string | null;
  responsable_id?: string | null;
  dias_aviso?: number | null;
  notificar?: boolean;
  procesoId?: string | null;
};

export async function editarEvento(id: string, cambios: EdicionEvento): Promise<ResultadoSimple> {
  if (!esUuid(id)) return { ok: false, error: "Diligencia no válida" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión expirada. Vuelve a iniciar sesión." };

  if (!await puedeAdministrarEntidad("evento")) return { ok: false, error: "Tu rol no permite editar diligencias" };

  const { data: actual } = await supabase
    .from("eventos")
    .select("inicia_en, titulo, tipo_diligencia")
    .eq("id", id)
    .maybeSingle();
  if (!actual) return { ok: false, error: "No se encontró la diligencia" };

  const parche: Record<string, unknown> = {};

  const tipoFinal = "tipo_diligencia" in cambios ? limpiar(cambios.tipo_diligencia, 120) : actual.tipo_diligencia;
  if ("titulo" in cambios) parche.titulo = limpiar(cambios.titulo, 240) ?? tipoFinal ?? "Diligencia";
  if ("tipo_diligencia" in cambios) parche.tipo_diligencia = limpiar(cambios.tipo_diligencia, 120);
  if ("responsable" in cambios) parche.responsable = limpiar(cambios.responsable, 120);
  if ("dias_aviso" in cambios) parche.dias_aviso = diasAviso(cambios.dias_aviso);
  if ("notificar" in cambios && typeof cambios.notificar === "boolean") parche.notificar = cambios.notificar;

  if ("responsable_id" in cambios) {
    if (cambios.responsable_id != null && !esUuid(cambios.responsable_id)) {
      return { ok: false, error: "Responsable no válido" };
    }
    parche.responsable_id = cambios.responsable_id ?? null;
  }

  if (("fecha" in cambios || "hora" in cambios) && actual.inicia_en) {
    const base = descomponerIniciaEn(actual.inicia_en);
    const fecha = (cambios.fecha ?? base.fecha).trim();
    if (!esFechaISOValida(fecha)) return { ok: false, error: "La fecha no es válida" };
    let hora: string | null = "hora" in cambios ? (cambios.hora?.trim() || null) : base.hora;
    if (hora === "00:00") hora = null;
    if (hora && !esHoraISOValida(hora)) return { ok: false, error: "La hora no es válida" };
    parche.inicia_en = componerIniciaEn(fecha, hora);
  }

  if (Object.keys(parche).length === 0) return { ok: true };

  const { error } = await supabase.from("eventos").update(parche).eq("id", id);
  if (error) {
    if (error.code === "42501") return { ok: false, error: "Sin permiso para editar diligencias" };
    return { ok: false, error: error.message };
  }

  revalidar(cambios.procesoId);
  return { ok: true };
}

/**
 * Cierra una diligencia (o la reabre con `estado = "PENDIENTE"`).
 *
 * Mientras está PENDIENTE sigue apareciendo en la campana, el dashboard y el
 * correo aunque su fecha ya haya pasado. Cerrarla es un acto deliberado: es
 * la única forma de distinguir una audiencia atendida de una que se perdió.
 */
export async function cerrarEvento(
  id: string,
  estado: EstadoDiligencia,
  opciones: { resultado?: string | null; procesoId?: string | null } = {}
): Promise<ResultadoSimple> {
  if (!esUuid(id)) return { ok: false, error: "Diligencia no válida" };
  if (!esEstadoDiligencia(estado)) return { ok: false, error: "Estado no válido" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión expirada. Vuelve a iniciar sesión." };

  if (!await puedeAdministrarEntidad("evento")) return { ok: false, error: "Tu rol no permite cerrar diligencias" };

  const cerrada = estado !== "PENDIENTE";
  const { error } = await supabase
    .from("eventos")
    .update({
      estado,
      resultado: limpiar(opciones.resultado, 500),
      cerrado_en: cerrada ? new Date().toISOString() : null,
      cerrado_por: cerrada ? user.id : null,
    })
    .eq("id", id);

  if (error) {
    if (error.code === "42501") return { ok: false, error: "Sin permiso para cerrar diligencias" };
    return { ok: false, error: error.message };
  }

  revalidar(opciones.procesoId);
  return { ok: true };
}

export async function eliminarEvento(id: string, procesoId?: string | null): Promise<ResultadoSimple> {
  if (!esUuid(id)) return { ok: false, error: "Diligencia no válida" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión expirada. Vuelve a iniciar sesión." };

  if (!await puedeAdministrarEntidad("evento")) return { ok: false, error: "Tu rol no permite eliminar diligencias" };

  // Baja reversible: el vínculo con el proceso se conserva para que
  // restaurar devuelva la diligencia a su expediente.
  const baja = await mandarAPapelera(supabase, "eventos", id);
  if (!baja.ok) return baja;

  revalidar(procesoId);
  return { ok: true };
}

function revalidar(procesoId?: string | null) {
  revalidatePath("/dashboard");
  revalidatePath("/procesos");
  revalidatePath("/procesos/materia/[materia]", "page");
  if (procesoId) revalidatePath(`/procesos/${procesoId}`);
}
