import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRowsIn } from "@/lib/supabase/fetch-all";

/**
 * Cuenta archivos con una sola consulta para evitar el patrón N+1 en tablas.
 */
export async function contarArchivosPorEntidad(
  supabase: SupabaseClient,
  entidadTipo: string,
  entidadIds: string[]
): Promise<Record<string, number>> {
  if (entidadIds.length === 0) return {};

  // Por lotes: con cientos de ids (501 predios, 931 documentos) la URL de
  // `.in()` excede el límite de PostgREST, la consulta falla y, sin esto,
  // la columna "Adjuntos" salía en 0 para todas las filas.
  const { data, error } = await fetchAllRowsIn(entidadIds, (lote, from, to) =>
    supabase
      .from("archivos")
      .select("entidad_id")
      .eq("entidad_tipo", entidadTipo)
      .in("entidad_id", lote)
      .order("id")
      .range(from, to)
  );
  if (error) console.error(`contarArchivosPorEntidad(${entidadTipo}):`, error.message);

  return (data ?? []).reduce<Record<string, number>>((conteos, archivo) => {
    const entidadId = archivo.entidad_id as string | null;
    if (entidadId) conteos[entidadId] = (conteos[entidadId] ?? 0) + 1;
    return conteos;
  }, {});
}
