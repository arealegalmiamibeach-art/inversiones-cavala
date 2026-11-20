/**
 * Propiedades NATIVAS eliminadas (tabla `propiedades_nativas_eliminadas`).
 *
 * Una propiedad nativa es una columna real de la tabla del registro, así que
 * "eliminarla" no borra el dato: la esconde de la ficha lateral y de las
 * tablas para todos los usuarios, y restaurarla la devuelve intacta. Cada una
 * se identifica por el tipo de entidad (el mismo de las propiedades
 * personalizadas) y por su `campo`: el id que usa la fila de la ficha y la
 * columna de la tabla.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { esTipoEntidadPersonalizable } from "@/lib/propiedades/personalizadas";

/** Campos eliminados de cada tipo de entidad. */
export type PropiedadesNativasEliminadas = Record<string, string[]>;

/**
 * Lo que se lee de la base para todo el dashboard. Si falta aplicar la
 * migración o la consulta falla, todo se ve como antes en vez de romper la
 * vista.
 */
export async function cargarPropiedadesNativasEliminadas(supabase: SupabaseClient): Promise<PropiedadesNativasEliminadas> {
  const { data, error } = await supabase
    .from("propiedades_nativas_eliminadas")
    .select("entidad_tipo, campo");
  if (error) return {};

  const porEntidad: PropiedadesNativasEliminadas = {};
  for (const fila of data ?? []) {
    const entidad = fila.entidad_tipo as string;
    if (!esTipoEntidadPersonalizable(entidad)) continue;
    (porEntidad[entidad] ??= []).push(fila.campo as string);
  }
  return porEntidad;
}
