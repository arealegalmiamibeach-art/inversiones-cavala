import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ResultadoBaja = { ok: true } | { ok: false; error: string };

/**
 * Manda un registro a la papelera.
 *
 * Tiene que pasar por el RPC `papelera_eliminar` (security definer) y no por
 * un UPDATE normal: al evaluar un UPDATE, Postgres aplica las políticas
 * RESTRICTIVE de SELECT también a la fila resultante, así que
 * "ocultar_eliminados" rechazaría justo la fila que se acaba de volver
 * invisible ("new row violates row-level security policy"). El RPC comprueba
 * `puede_escribir()` por dentro, y el trigger `registrar_historial` anota la
 * baja igual, porque `auth.uid()` no cambia dentro de un security definer.
 */
export async function mandarAPapelera(
  supabase: SupabaseClient,
  tabla: string,
  id: string
): Promise<ResultadoBaja> {
  const { data, error } = await supabase.rpc("papelera_eliminar", {
    p_tabla: tabla,
    p_id: id,
  });

  if (error) {
    if (error.code === "42501") return { ok: false, error: "Sin permiso para eliminar este registro" };
    // Los `raise exception` del RPC llegan con prefijos de Postgres.
    return { ok: false, error: error.message.replace(/^.*?:\s*/, "").trim() || error.message };
  }
  if (data && data.ok === false) return { ok: false, error: data.error as string };
  return { ok: true };
}

/**
 * Borra de R2 las claves encoladas que ya ninguna fila de `archivos` usa y las
 * saca de la cola `r2_huerfanos`.
 *
 * La clave de R2 es el sha256 del contenido: si alguien vuelve a subir el mismo
 * archivo después de que su clave se encoló, el objeto vuelve a estar en uso.
 * Borrarlo a ciegas dejaba esa ficha nueva apuntando a un archivo inexistente,
 * así que antes de borrar se le pregunta a la base (`r2_claves_liberables`,
 * security definer: ve también las filas en la papelera, que RLS esconde).
 * Si esa comprobación falla no se borra nada: las claves siguen en la cola y
 * se reintentan en la próxima pasada. Nunca lanza.
 */
export async function borrarClavesLiberables(
  supabase: SupabaseClient,
  claves: string[],
  borrarObjeto: (clave: string) => Promise<void>
): Promise<void> {
  if (claves.length === 0) return;

  const { data, error } = await supabase.rpc("r2_claves_liberables", { p_claves: claves });
  if (error) {
    console.error("[papelera] no se pudo comprobar el uso de las claves de R2:", error.code, error.message);
    return;
  }

  const libres = Array.isArray(data) ? data.filter((clave): clave is string => typeof clave === "string") : [];
  for (const clave of libres) {
    try {
      await borrarObjeto(clave);
      await supabase.from("r2_huerfanos").delete().eq("r2_key", clave);
    } catch {
      // Queda en la cola para el siguiente intento.
    }
  }
}
