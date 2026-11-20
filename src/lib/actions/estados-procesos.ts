"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { puedeAdministrarEntidad } from "@/lib/auth/perfil";
import { esUuid } from "@/lib/contratos/adendas";
import { MATERIAS } from "@/app/(dashboard)/procesos/opciones";
import { colorEstadoNuevo } from "@/lib/procesos/estados";

type Resultado = { ok: true } | { ok: false; error: string };

async function sesionEditable() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!await puedeAdministrarEntidad("proceso")) return { ok: false as const, error: "No puedes administrar los estados de Procesos" };
  return { ok: true as const, supabase };
}

function revalidarProcesos() {
  revalidatePath("/procesos", "layout");
}

function errorDeInsercion(error: { code?: string; message: string }): Resultado {
  if (error.code === "23505") return { ok: false, error: "Ese estado ya existe en esa materia" };
  if (error.code === "42P01" || error.code === "PGRST205") return { ok: false, error: "Falta aplicar la migración de estados de procesos" };
  return { ok: false, error: error.message };
}

/** Siguiente posición libre al final de una materia. */
async function ordenSiguiente(supabase: Awaited<ReturnType<typeof createClient>>, materia: string) {
  const { data } = await supabase
    .from("estados_procesos")
    .select("orden")
    .eq("materia", materia)
    .order("orden", { ascending: false })
    .limit(1)
    .maybeSingle();
  return ((data?.orden as number | undefined) ?? 0) + 1;
}

/** Cada estado pertenece a una materia; el mismo nombre puede existir en varias. */
export async function crearEstadoProceso(valor: string, materia: string): Promise<Resultado> {
  const limpio = valor.trim().replace(/\s+/g, " ");
  if (!limpio) return { ok: false, error: "Escribe un nombre para el estado" };
  if (limpio.length > 80) return { ok: false, error: "El estado puede tener hasta 80 caracteres" };
  if (!(materia in MATERIAS)) return { ok: false, error: "Materia no válida" };

  const sesion = await sesionEditable();
  if (!sesion.ok) return sesion;

  // Mismo nombre = mismo color en todas las materias.
  const { data: igual } = await sesion.supabase
    .from("estados_procesos")
    .select("clase_color, color_punto")
    .eq("valor", limpio)
    .limit(1)
    .maybeSingle();
  const nuevo = colorEstadoNuevo(limpio);
  const clase = (igual?.clase_color as string | undefined) ?? nuevo.clase;
  const punto = (igual?.color_punto as string | undefined) ?? nuevo.punto;

  const { error } = await sesion.supabase
    .from("estados_procesos")
    .insert({ valor: limpio, clase_color: clase, color_punto: punto, materia, orden: await ordenSiguiente(sesion.supabase, materia) });
  if (error) return errorDeInsercion(error);

  revalidarProcesos();
  return { ok: true };
}

/**
 * Renombra el estado y, en el mismo paso, el texto de `procesos.estado` de
 * esa materia (función SQL: incluye los procesos que están en la papelera).
 */
export async function renombrarEstadoProceso(estadoId: string, valor: string): Promise<Resultado> {
  if (!esUuid(estadoId)) return { ok: false, error: "Estado no válido" };
  const limpio = valor.trim().replace(/\s+/g, " ");
  if (!limpio) return { ok: false, error: "Escribe un nombre para el estado" };
  if (limpio.length > 80) return { ok: false, error: "El estado puede tener hasta 80 caracteres" };

  const sesion = await sesionEditable();
  if (!sesion.ok) return sesion;

  const { data, error } = await sesion.supabase.rpc("renombrar_estado_proceso", { p_id: estadoId, p_valor: limpio });
  if (error) return { ok: false, error: error.message };
  const respuesta = data as { ok: boolean; error?: string } | null;
  if (!respuesta?.ok) return { ok: false, error: respuesta?.error ?? "No se pudo renombrar el estado" };

  revalidarProcesos();
  return { ok: true };
}

/**
 * Deja la materia con exactamente este orden: `ids` son sus estados de arriba
 * abajo. Sirve para reordenar dentro de una materia y para mover un estado a
 * otra (su id viene en la lista de destino, en la posición donde se soltó).
 */
export async function ordenarEstadosProceso(materia: string, ids: string[]): Promise<Resultado> {
  if (!(materia in MATERIAS)) return { ok: false, error: "Materia no válida" };
  if (ids.length === 0 || ids.length > 200 || new Set(ids).size !== ids.length || !ids.every(esUuid)) {
    return { ok: false, error: "Orden no válido" };
  }

  const sesion = await sesionEditable();
  if (!sesion.ok) return sesion;

  const resultados = await Promise.all(
    ids.map((id, indice) =>
      sesion.supabase.from("estados_procesos").update({ materia, orden: indice + 1 }).eq("id", id)
    )
  );
  const fallo = resultados.find((resultado) => resultado.error);
  if (fallo?.error) {
    revalidarProcesos();
    return errorDeInsercion(fallo.error);
  }

  revalidarProcesos();
  return { ok: true };
}

/**
 * Quita el estado del catálogo. Los procesos que ya lo tienen conservan el
 * texto (el desplegable lo marca como "fuera de la lista" hasta que se cambie).
 */
export async function eliminarEstadoProceso(estadoId: string): Promise<Resultado> {
  if (!esUuid(estadoId)) return { ok: false, error: "Estado no válido" };

  const sesion = await sesionEditable();
  if (!sesion.ok) return sesion;

  const { error } = await sesion.supabase
    .from("estados_procesos")
    .delete()
    .eq("id", estadoId);
  if (error) return { ok: false, error: error.message };

  revalidarProcesos();
  return { ok: true };
}
