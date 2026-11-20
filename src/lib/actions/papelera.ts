"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getRol } from "@/lib/auth/perfil";
import { esAdmin } from "@/lib/auth/roles";
import { deleteObject } from "@/lib/r2/client";
import { borrarClavesLiberables } from "@/lib/papelera-server";
import { esUuid } from "@/lib/contratos/adendas";
import { tipoPapelera, TIPOS_PAPELERA, type FilaPapelera } from "@/lib/papelera";

/**
 * Papelera. Todo el trabajo pesado vive en los RPC `papelera_*` de la
 * migración 20260831000400 — son `security definer` porque tienen que ver
 * justo lo que la política "ocultar_eliminados" esconde. Aquí sólo se
 * valida la entrada, se revalidan rutas y se limpia R2, que Postgres no
 * puede tocar.
 */

export type ResultadoPapelera = { ok: true } | { ok: false; error: string };
export type ListadoPapelera =
  | { ok: true; filas: FilaPapelera[] }
  | { ok: false; error: string };

type FilaRpc = {
  tabla: string;
  id: string;
  nombre: string;
  eliminado_en: string;
  actor_id: string | null;
  actor_nombre: string | null;
  actor_correo: string | null;
  adjuntos: number;
};

const ERROR_ROL = "Sólo un administrador puede gestionar la papelera";

export async function listarPapelera(): Promise<ListadoPapelera> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!esAdmin(await getRol())) return { ok: false, error: ERROR_ROL };

  const { data, error } = await supabase.rpc("papelera_listar");
  if (error) return { ok: false, error: error.message };

  const filas: FilaPapelera[] = ((data ?? []) as FilaRpc[]).map((f) => ({
    tabla: f.tabla,
    id: f.id,
    nombre: f.nombre,
    eliminadoEn: f.eliminado_en,
    actorId: f.actor_id,
    actorNombre: f.actor_nombre,
    actorCorreo: f.actor_correo,
    adjuntos: f.adjuntos ?? 0,
  }));

  // Oportunista: si quedaron objetos de R2 encolados (por una purga cuyo
  // borrado remoto falló, o por la purga automática), se intentan aquí.
  await vaciarColaR2(supabase);

  return { ok: true, filas };
}

export async function restaurarDePapelera(tabla: string, id: string): Promise<ResultadoPapelera> {
  const validacion = await validar(tabla, id);
  if ("error" in validacion) return { ok: false, error: validacion.error };

  const { data, error } = await validacion.supabase.rpc("papelera_restaurar", {
    p_tabla: tabla,
    p_id: id,
  });
  if (error) return { ok: false, error: mensajeRpc(error.message) };
  if (data && data.ok === false) return { ok: false, error: data.error as string };

  revalidar(tabla, id);
  return { ok: true };
}

export async function purgarDePapelera(tabla: string, id: string): Promise<ResultadoPapelera> {
  const validacion = await validar(tabla, id);
  if ("error" in validacion) return { ok: false, error: validacion.error };
  const { supabase } = validacion;

  const { data, error } = await supabase.rpc("papelera_purgar", { p_tabla: tabla, p_id: id });
  if (error) return { ok: false, error: mensajeRpc(error.message) };
  if (data && data.ok === false) return { ok: false, error: data.error as string };

  // El RPC encoló las claves huérfanas; borrarlas de R2 es cosa de la app.
  await borrarClavesR2(supabase, leerClaves(data));

  revalidar(tabla, id);
  return { ok: true };
}

export async function vaciarVencidos(): Promise<{ ok: true; purgados: number } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!esAdmin(await getRol())) return { ok: false, error: ERROR_ROL };

  const { data, error } = await supabase.rpc("papelera_purgar_vencidos");
  if (error) return { ok: false, error: mensajeRpc(error.message) };

  await vaciarColaR2(supabase);

  for (const clave of Object.keys(TIPOS_PAPELERA)) revalidar(clave);
  return { ok: true, purgados: Number(data?.purgados ?? 0) };
}

// ─── Auxiliares ────────────────────────────────────────────────────────────

type Validado = { supabase: Awaited<ReturnType<typeof createClient>> } | { error: string };

async function validar(tabla: string, id: string): Promise<Validado> {
  if (!TIPOS_PAPELERA[tabla]) return { error: "Tipo de registro no válido" };
  if (!esUuid(id)) return { error: "Registro no válido" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!esAdmin(await getRol())) return { error: ERROR_ROL };

  return { supabase };
}

/** Los `raise exception` del RPC llegan con prefijos de Postgres; se limpian. */
function mensajeRpc(mensaje: string): string {
  return mensaje.replace(/^.*?:\s*/, "").trim() || mensaje;
}

function leerClaves(data: unknown): string[] {
  const claves = (data as { r2_keys?: unknown } | null)?.r2_keys;
  return Array.isArray(claves) ? claves.filter((k): k is string => typeof k === "string") : [];
}

type Cliente = Awaited<ReturnType<typeof createClient>>;

/**
 * Borra de R2 las claves indicadas que ya nadie usa y las saca de la cola. Un
 * fallo no revierte nada: la clave se queda encolada y se reintenta en la
 * próxima apertura del panel. Nunca lanza.
 */
async function borrarClavesR2(supabase: Cliente, claves: string[]): Promise<void> {
  await borrarClavesLiberables(supabase, claves, deleteObject);
}

const MAX_COLA_POR_PASADA = 25;

async function vaciarColaR2(supabase: Cliente): Promise<void> {
  try {
    const { data } = await supabase
      .from("r2_huerfanos")
      .select("r2_key")
      .order("registrado_en")
      .limit(MAX_COLA_POR_PASADA);
    const claves = (data ?? []).map((f) => f.r2_key as string);
    if (claves.length) await borrarClavesR2(supabase, claves);
  } catch {
    // La cola no es crítica para la respuesta que el usuario ya está viendo.
  }
}

function revalidar(tabla: string, id?: string) {
  for (const ruta of tipoPapelera(tabla).revalidar) revalidatePath(ruta);
  const href = tipoPapelera(tabla).href;
  if (id && href) revalidatePath(href(id));
  revalidatePath("/dashboard");
}
