// Helpers puros: reciben la consulta del cliente autenticado (servidor o navegador).

type QueryError = {
  code?: string;
  message: string;
};

type RangeResult<T> = {
  data: T[] | null;
  error: QueryError | null;
};

/**
 * Lee una colección completa respetando el límite máximo de filas de
 * PostgREST. La paginación es únicamente interna: la interfaz recibe un solo
 * arreglo y puede filtrar o agrupar todas las filas sin páginas visibles.
 */
export async function fetchAllRows<T>(
  fetchRange: (from: number, to: number) => PromiseLike<RangeResult<T>>,
  batchSize = 1000
): Promise<RangeResult<T>> {
  const rows: T[] = [];

  for (let from = 0; ; from += batchSize) {
    const result = await fetchRange(from, from + batchSize - 1);
    if (result.error) return { data: null, error: result.error };

    const batch = result.data ?? [];
    rows.push(...batch);
    if (batch.length < batchSize) return { data: rows, error: null };
  }
}

/**
 * Igual que `fetchAllRows`, pero para filtros `.in(columna, ids)` con listas
 * largas: PostgREST mete los ids en la URL y, pasados unos cientos de UUIDs,
 * responde 400 Bad Request. Parte los ids en lotes y junta los resultados.
 */
export async function fetchAllRowsIn<T>(
  ids: string[],
  fetchRange: (ids: string[], from: number, to: number) => PromiseLike<RangeResult<T>>,
  idsPorLote = 100
): Promise<RangeResult<T>> {
  const lotes: string[][] = [];
  for (let i = 0; i < ids.length; i += idsPorLote) {
    lotes.push(ids.slice(i, i + idsPorLote));
  }
  const resultados = await Promise.all(
    lotes.map((lote) => fetchAllRows((from, to) => fetchRange(lote, from, to)))
  );
  const rows: T[] = [];
  for (const result of resultados) {
    if (result.error) return { data: null, error: result.error };
    rows.push(...(result.data ?? []));
  }
  return { data: rows, error: null };
}
