"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { puedeAdministrarEntidad } from "@/lib/auth/perfil";
import { esUuid } from "@/lib/contratos/adendas";
import { esNombreTipoFijo } from "@/lib/propietarios/tipos-catalogo";

type Resultado = { ok: true } | { ok: false; error: string };

const FALTA_MIGRACION = "Falta aplicar la migración que permite renombrar y ordenar los tipos de propietario";

function limpiarNombre(valor: unknown): string {
  return typeof valor === "string" ? valor.trim().replace(/\s+/g, " ") : "";
}

/** Lo que ve el usuario cambió: la lista, cada ficha y el modal "Nuevo propietario" lo releen. */
function revalidarTipos() {
  revalidatePath("/entidades/propietarios");
  revalidatePath("/entidades/propietarios/[id]", "page");
}

/** La función SQL todavía no existe (migración sin aplicar). */
function faltaFuncion(error: { code?: string; message?: string }): boolean {
  return error.code === "PGRST202" || error.code === "42883" || Boolean(error.message?.includes("Could not find the function"));
}

async function sesionEditable() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!await puedeAdministrarEntidad("propietarios")) {
    return { ok: false as const, error: "Tu rol no permite editar los tipos de propietario" };
  }
  return { ok: true as const, supabase };
}

export async function listarTiposPropietario() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sesión expirada", tipos: [] as { id: string; nombre: string }[] };

  // En el orden que eligió el usuario; sin la migración (`orden`), por nombre como siempre.
  let { data, error } = await supabase
    .from("tipos_propietario")
    .select("id, nombre")
    .order("orden")
    .order("nombre");
  if (error) {
    ({ data, error } = await supabase.from("tipos_propietario").select("id, nombre").order("nombre"));
  }

  if (error) return { ok: false as const, error: error.message, tipos: [] as { id: string; nombre: string }[] };
  return {
    ok: true as const,
    tipos: (data ?? [])
      .map((fila) => ({ id: fila.id as string, nombre: fila.nombre as string }))
      .filter((fila) => fila.id && fila.nombre),
  };
}

export async function crearTipoPropietario(valor: string) {
  const nombre = limpiarNombre(valor);
  if (!nombre) return { ok: false as const, error: "Escribe un nombre para el tipo" };
  if (nombre.length > 80) return { ok: false as const, error: "El tipo no puede pasar de 80 caracteres" };
  if (esNombreTipoFijo(nombre)) return { ok: false as const, error: "«Propio» y «Tercero» ya existen como tipos fijos" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sesión expirada. Vuelve a iniciar sesión." };

  if (!await puedeAdministrarEntidad("propietario")) return { ok: false as const, error: "Tu rol no permite crear tipos" };

  const { data, error } = await supabase
    .from("tipos_propietario")
    .insert({ nombre })
    .select("id, nombre")
    .single();

  if (error?.code === "23505") {
    const { data: existentes } = await supabase.from("tipos_propietario").select("id, nombre");
    const existente = (existentes ?? []).find(
      (fila) => limpiarNombre(fila.nombre).toLocaleLowerCase("es-PE") === nombre.toLocaleLowerCase("es-PE")
    );
    if (existente) {
      return { ok: true as const, tipo: { id: existente.id as string, nombre: existente.nombre as string } };
    }
    return { ok: false as const, error: "Ese tipo ya existe" };
  }
  if (error || !data) {
    if (error?.code === "42501") return { ok: false as const, error: "Sin permiso para crear tipos" };
    return { ok: false as const, error: error?.message ?? "No se pudo crear el tipo" };
  }

  revalidarTipos();
  return { ok: true as const, tipo: { id: data.id as string, nombre: data.nombre as string } };
}

export async function eliminarTipoPropietario(id: string) {
  if (!esUuid(id)) return { ok: false as const, error: "Tipo no válido" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sesión expirada. Vuelve a iniciar sesión." };

  if (!await puedeAdministrarEntidad("propietario")) return { ok: false as const, error: "Tu rol no permite eliminar tipos" };

  const { error } = await supabase.from("tipos_propietario").delete().eq("id", id);
  if (error) {
    if (error.code === "42501") return { ok: false as const, error: "Sin permiso para eliminar tipos" };
    return { ok: false as const, error: error.message };
  }

  revalidarTipos();
  return { ok: true as const };
}

/**
 * Renombra el tipo y, en el mismo paso, el texto de los propietarios que lo
 * usan (`extra.tipo_propietario`). Lo hace la función SQL `renombrar_tipo_propietario`.
 */
export async function renombrarTipoPropietario(id: string, valor: string): Promise<Resultado> {
  if (!esUuid(id)) return { ok: false, error: "Tipo no válido" };
  const nombre = limpiarNombre(valor);
  if (!nombre) return { ok: false, error: "Escribe un nombre para el tipo" };
  if (nombre.length > 80) return { ok: false, error: "El tipo no puede pasar de 80 caracteres" };
  if (esNombreTipoFijo(nombre)) return { ok: false, error: "«Propio» y «Tercero» son tipos fijos" };

  const sesion = await sesionEditable();
  if (!sesion.ok) return sesion;

  const { data, error } = await sesion.supabase.rpc("renombrar_tipo_propietario", { p_id: id, p_nombre: nombre });
  if (error) return { ok: false, error: faltaFuncion(error) ? FALTA_MIGRACION : error.message };
  const respuesta = data as { ok: boolean; error?: string } | null;
  if (!respuesta?.ok) return { ok: false, error: respuesta?.error ?? "No se pudo renombrar el tipo" };

  revalidarTipos();
  return { ok: true };
}

/** Deja los tipos personalizados en exactamente este orden (`ids`, de arriba abajo). */
export async function ordenarTiposPropietario(ids: string[]): Promise<Resultado> {
  if (ids.length === 0 || ids.length > 200 || new Set(ids).size !== ids.length || !ids.every(esUuid)) {
    return { ok: false, error: "Orden no válido" };
  }

  const sesion = await sesionEditable();
  if (!sesion.ok) return sesion;

  const { data, error } = await sesion.supabase.rpc("ordenar_tipos_propietario", { p_ids: ids });
  if (error) return { ok: false, error: faltaFuncion(error) ? FALTA_MIGRACION : error.message };
  const respuesta = data as { ok: boolean; error?: string } | null;
  if (!respuesta?.ok) return { ok: false, error: respuesta?.error ?? "No se pudo guardar el orden" };

  revalidarTipos();
  return { ok: true };
}
