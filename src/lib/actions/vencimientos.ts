"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getPerfil, puedeAdministrarEntidad } from "@/lib/auth/perfil";
import { registrarEvento, TABLA_POR_ENTIDAD } from "@/lib/historial-server";
import { ENTIDADES_PERSONALIZABLES, esTipoEntidadPersonalizable } from "@/lib/propiedades/personalizadas";
import { esFechaISOValida } from "@/lib/utils";
import {
  entidadDeAlerta,
  fechaCortaCierre,
  textoCierre,
  validarCierre,
  type EntradaCierre,
  type ResultadoCierre,
} from "@/lib/vencimientos/cierres";

/**
 * Cerrar y reabrir un vencimiento (tabla `vencimientos_cierres`).
 * Diseño: docs/DISENO-CIERRE-VENCIMIENTOS.md.
 *
 * La entidad dueña se deriva del id de la alerta aquí, en el servidor: no se
 * confía en un tipo/id que mande el navegador. La RLS repite el control de
 * permiso con `acceso_entidad`.
 */

export type ResultadoSimple = { ok: true } | { ok: false; error: string };

type Entidad = { tipo: string; id: string };

async function resolverEntidad(supabase: SupabaseClient, alertaId: string): Promise<Entidad | null> {
  const entidad = entidadDeAlerta(alertaId);
  if (!entidad) return null;
  if (entidad.tipo === "fija") return { tipo: entidad.entidadTipo, id: entidad.entidadId };

  const { data } = await supabase
    .from("propiedades_personalizadas")
    .select("entidad_tipo")
    .eq("id", entidad.propiedadId)
    .maybeSingle();
  const tipo = (data as { entidad_tipo?: unknown } | null)?.entidad_tipo;
  return typeof tipo === "string" && esTipoEntidadPersonalizable(tipo) ? { tipo, id: entidad.entidadId } : null;
}

function revalidar(entidad: Entidad) {
  revalidatePath("/dashboard");
  const base = esTipoEntidadPersonalizable(entidad.tipo) ? ENTIDADES_PERSONALIZABLES[entidad.tipo].href : null;
  if (base) revalidatePath(`${base}/${entidad.id}`);
}

function mensajeError(error: { code?: string; message: string }): string {
  if (error.code === "42501") return "Tu rol no permite cerrar este vencimiento";
  if (error.code === "42P01") return "Falta aplicar la migración de cierres de vencimientos";
  if (error.code === "23505") return "Otra persona ya cerró este vencimiento. Recarga la página.";
  return error.message;
}

export async function cerrarVencimiento(entrada: EntradaCierre): Promise<ResultadoSimple> {
  const invalido = validarCierre(entrada);
  if (invalido) return { ok: false, error: invalido };
  if (!esFechaISOValida(entrada.fecha)) return { ok: false, error: "Fecha no válida" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión expirada. Vuelve a iniciar sesión." };

  const entidad = await resolverEntidad(supabase, entrada.alertaId);
  if (!entidad) return { ok: false, error: "No se encontró el registro de este vencimiento" };
  if (!await puedeAdministrarEntidad(entidad.tipo)) return { ok: false, error: "Tu rol no permite cerrar este vencimiento" };

  const perfil = await getPerfil();
  const nota = (typeof entrada.nota === "string" ? entrada.nota.trim() : "") || null;
  const resultado = entrada.resultado as ResultadoCierre;

  const { error } = await supabase.from("vencimientos_cierres").insert({
    alerta_id: entrada.alertaId,
    fecha: entrada.fecha,
    entidad_tipo: entidad.tipo,
    entidad_id: entidad.id,
    resultado,
    nota,
    cerrado_por: user.id,
    cerrado_por_nombre: perfil?.nombre || perfil?.correo || null,
  });
  if (error) return { ok: false, error: mensajeError(error) };

  const tabla = TABLA_POR_ENTIDAD[entidad.tipo];
  if (tabla) {
    await registrarEvento(supabase, user.id, {
      tabla,
      registroId: entidad.id,
      accion: "crear",
      campo: "vencimiento",
      valorNuevo: `Vence ${fechaCortaCierre(entrada.fecha)} · ${textoCierre({ resultado, nota })}`,
    });
  }

  revalidar(entidad);
  return { ok: true };
}

export async function reabrirVencimiento(entrada: { alertaId: string; fecha: string }): Promise<ResultadoSimple> {
  if (!entrada || typeof entrada !== "object" || !entidadDeAlerta(entrada.alertaId)) return { ok: false, error: "Vencimiento no válido" };
  if (!esFechaISOValida(entrada.fecha)) return { ok: false, error: "Fecha no válida" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión expirada. Vuelve a iniciar sesión." };

  const entidad = await resolverEntidad(supabase, entrada.alertaId);
  if (!entidad) return { ok: false, error: "No se encontró el registro de este vencimiento" };
  if (!await puedeAdministrarEntidad(entidad.tipo)) return { ok: false, error: "Tu rol no permite reabrir este vencimiento" };

  // `select` para distinguir "no había nada que reabrir" de "la RLS no dejó".
  const { data, error } = await supabase
    .from("vencimientos_cierres")
    .delete()
    .eq("alerta_id", entrada.alertaId)
    .eq("fecha", entrada.fecha)
    .select("resultado, nota");
  if (error) return { ok: false, error: mensajeError(error) };

  // La RLS no da error al negar un DELETE: sólo no borra. Sin fila borrada, o
  // ya lo había reabierto otra persona o este rol no alcanza a ese registro
  // (p. ej. un tipo de contrato que no administra).
  const borrado = (data ?? [])[0] as { resultado: ResultadoCierre; nota: string | null } | undefined;
  if (!borrado) {
    revalidar(entidad);
    return { ok: false, error: "No se pudo reabrir: ya estaba abierto o tu rol no lo permite. Recarga la página." };
  }
  const tabla = TABLA_POR_ENTIDAD[entidad.tipo];
  if (tabla) {
    await registrarEvento(supabase, user.id, {
      tabla,
      registroId: entidad.id,
      accion: "eliminar",
      campo: "vencimiento",
      valorAnterior: `Vence ${fechaCortaCierre(entrada.fecha)} · ${textoCierre(borrado)}`,
    });
  }

  revalidar(entidad);
  return { ok: true };
}
