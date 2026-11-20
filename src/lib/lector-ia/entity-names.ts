import type { SupabaseClient } from "@supabase/supabase-js";

/** Lo mínimo de una fila de `archivos` para saber de qué ficha es. */
type ArchivoConEntidad = { entidad_tipo: string | null; entidad_id: string | null };

// `archivos` sólo guarda `entidad_tipo` + `entidad_id` (un UUID); sin resolver
// el nombre real de la entidad relacionada, buscar por el nombre de un
// propietario, predio o contrato no encontraba sus archivos adjuntos.
const ENTITY_NAME_TABLES: Record<string, { table: string; columns: string[] }> = {
  documento: { table: "documentos", columns: ["nombre"] },
  contrato: { table: "contratos", columns: ["nombre"] },
  proceso: { table: "procesos", columns: ["materia", "expediente", "asunto"] },
  vehiculo: { table: "vehiculos", columns: ["placa", "marca_modelo", "responsable"] },
  predio: { table: "predios", columns: ["nombre", "n_partida", "a_nombre_de"] },
  concesion: { table: "concesiones_mineras", columns: ["nombre", "codigo"] },
  propietario: { table: "propietarios", columns: ["nombre"] },
  personal: { table: "personal", columns: ["nombre"] },
};

/**
 * `.in()` viaja en la URL: pasados ~396 UUIDs PostgREST responde 400. Con
 * lotes de 500, los primeros 500 documentos se quedaban sin nombre y la
 * búsqueda por el nombre de su ficha no los encontraba.
 */
export const ENTITY_NAME_CHUNK = 100;

/** Nombre legible de la ficha de cada archivo, con clave `tipo:id`. */
export async function resolveLectorEntityNames(supabase: SupabaseClient, rows: ArchivoConEntidad[]) {
  const idsByType = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.entidad_tipo || !row.entidad_id || !ENTITY_NAME_TABLES[row.entidad_tipo]) continue;
    if (!idsByType.has(row.entidad_tipo)) idsByType.set(row.entidad_tipo, new Set());
    idsByType.get(row.entidad_tipo)!.add(row.entidad_id);
  }

  const names = new Map<string, string>();
  await Promise.all(Array.from(idsByType.entries()).flatMap(([tipo, idSet]) => {
    const { table, columns } = ENTITY_NAME_TABLES[tipo];
    const ids = Array.from(idSet);
    const chunks = Array.from({ length: Math.ceil(ids.length / ENTITY_NAME_CHUNK) }, (_, index) => ids.slice(index * ENTITY_NAME_CHUNK, (index + 1) * ENTITY_NAME_CHUNK));
    return chunks.map(async (chunk) => {
      const query = supabase.from(table).select(["id", ...columns].join(", ")).in("id", chunk);
      const { data, error } = (await query) as unknown as { data: Record<string, unknown>[] | null; error: { message: string } | null };
      if (error) console.error("Lector IA: no se pudieron leer los nombres de", table, error.message);
      for (const item of (data ?? []) as Record<string, unknown>[]) {
        const label = columns.map((column) => item[column]).filter((value) => typeof value === "string" && value.trim()).join(" · ");
        if (label) names.set(`${tipo}:${String(item.id)}`, label);
      }
    });
  }));
  return names;
}
