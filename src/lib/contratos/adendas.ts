/**
 * Adendas y resoluciones de un contrato.
 *
 * No hay tabla propia: una adenda es una fila más de `contratos`, marcada en
 * `extra` y enlazada al contrato padre por la tabla polimórfica `vinculos`
 * (`origen_tipo='contrato'` ↔ `destino_tipo='contrato'`).
 *
 *   extra = { es_adenda: true, documento_padre: "<uuid del padre>", clase: "adenda" | "resolucion" }
 *
 * `documento_padre` es la fuente de verdad para dibujar el árbol; el vínculo
 * existe para que la adenda también aparezca en el grafo de relaciones. Se leen
 * ambos sentidos porque la importación de Notion dejó las aristas en cualquier
 * dirección.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRowsIn } from "@/lib/supabase/fetch-all";

export type ClaseAdenda = "adenda" | "resolucion";

export const CLASES_ADENDA: readonly ClaseAdenda[] = ["adenda", "resolucion"];

export const CLASE_LABEL: Record<ClaseAdenda, string> = {
  adenda: "Adenda",
  resolucion: "Resolución",
};

export function esClaseAdenda(valor: unknown): valor is ClaseAdenda {
  return typeof valor === "string" && (CLASES_ADENDA as readonly string[]).includes(valor);
}

export type MarcaAdenda = {
  esAdenda: boolean;
  clase: ClaseAdenda;
  /** uuid del contrato padre declarado en `extra`, si lo hay. */
  padre: string | null;
  /** true si la fila la creó esta app (única condición para poder borrarla). */
  creadaEnApp: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function esUuid(valor: unknown): valor is string {
  return typeof valor === "string" && UUID.test(valor);
}

/** Lee la marca de adenda de un `extra` jsonb sin asumir su forma. */
export function leerMarcaAdenda(extra: unknown): MarcaAdenda {
  const datos = (extra ?? {}) as Record<string, unknown>;
  const padre = esUuid(datos.documento_padre) ? datos.documento_padre : null;
  return {
    esAdenda: datos.es_adenda === true || datos.es_adenda === "true" || padre !== null,
    clase: esClaseAdenda(datos.clase) ? datos.clase : "adenda",
    padre,
    creadaEnApp: datos.origen === "app",
  };
}

export type FilaConExtra = { id: string; extra?: Record<string, unknown> | null };

export type MapaAdendas = {
  /** id de la adenda → id del contrato padre. */
  padrePorHijo: Record<string, string>;
  /** id del contrato padre → ids de sus adendas/resoluciones, en orden de llegada. */
  hijosPorPadre: Record<string, string[]>;
};

const MAPA_VACIO: MapaAdendas = { padrePorHijo: {}, hijosPorPadre: {} };

/**
 * Arma el árbol padre → adendas de un lote de contratos con tres lecturas
 * (vínculos en ambos sentidos + los `extra` de los extremos que no están en el
 * lote), cada una partida en lotes de ids. Nunca una consulta por fila.
 */
export async function cargarMapaAdendas(
  supabase: SupabaseClient,
  contratos: FilaConExtra[]
): Promise<MapaAdendas> {
  const ids = contratos.map((contrato) => contrato.id).filter(esUuid);
  if (ids.length === 0) return MAPA_VACIO;

  const marcas = new Map<string, MarcaAdenda>();
  for (const contrato of contratos) marcas.set(contrato.id, leerMarcaAdenda(contrato.extra));

  // `ids` son todos los contratos de la lista (279 hoy): en un solo `.in()`
  // la URL deja de entrar pasados ~396 y el árbol se quedaría sin adendas.
  const [{ data: comoOrigen, error: errorOrigen }, { data: comoDestino, error: errorDestino }] = await Promise.all([
    fetchAllRowsIn(ids, (lote, desde, hasta) => supabase
      .from("vinculos")
      .select("origen_id, destino_id")
      .eq("origen_tipo", "contrato")
      .eq("destino_tipo", "contrato")
      .in("origen_id", lote)
      .order("id")
      .range(desde, hasta)),
    fetchAllRowsIn(ids, (lote, desde, hasta) => supabase
      .from("vinculos")
      .select("origen_id, destino_id")
      .eq("origen_tipo", "contrato")
      .eq("destino_tipo", "contrato")
      .in("destino_id", lote)
      .order("id")
      .range(desde, hasta)),
  ]);
  if (errorOrigen || errorDestino) {
    console.error("[adendas] no se pudieron leer los vínculos entre contratos:", (errorOrigen ?? errorDestino)?.message);
  }

  const aristas: [string, string][] = [];
  for (const vinculo of [...(comoOrigen ?? []), ...(comoDestino ?? [])] as { origen_id: string; destino_id: string }[]) {
    if (!esUuid(vinculo.origen_id) || !esUuid(vinculo.destino_id)) continue;
    if (vinculo.origen_id === vinculo.destino_id) continue;
    aristas.push([vinculo.origen_id, vinculo.destino_id]);
  }

  // Los extremos que no venían en el lote (adendas de otra página, o el padre
  // de una adenda listada) también necesitan su `extra` para saber quién cuelga
  // de quién: una sola consulta extra.
  const faltantes = Array.from(
    new Set(aristas.flat().filter((id) => !marcas.has(id)))
  );
  if (faltantes.length > 0) {
    const { data, error } = await fetchAllRowsIn(faltantes, (lote, desde, hasta) => supabase
      .from("contratos")
      .select("id, extra")
      .in("id", lote)
      .order("id")
      .range(desde, hasta));
    if (error) console.error("[adendas] no se pudieron leer los contratos enlazados:", error.message);
    for (const fila of (data ?? []) as FilaConExtra[]) marcas.set(fila.id, leerMarcaAdenda(fila.extra));
  }

  const padrePorHijo: Record<string, string> = {};

  function registrar(hijo: string, padre: string) {
    if (hijo === padre) return;
    if (padrePorHijo[hijo]) return; // primera relación gana; evita reasignar por aristas recíprocas
    padrePorHijo[hijo] = padre;
  }

  // 1) `extra.documento_padre` es explícito y manda.
  for (const [id, marca] of marcas) {
    if (marca.padre && marca.padre !== id) registrar(id, marca.padre);
  }

  // 2) El resto se deduce del vínculo: el extremo marcado como adenda es el hijo.
  for (const [origen, destino] of aristas) {
    const marcaOrigen = marcas.get(origen);
    const marcaDestino = marcas.get(destino);
    if (marcaOrigen?.esAdenda && !marcaDestino?.esAdenda) registrar(origen, destino);
    else if (marcaDestino?.esAdenda && !marcaOrigen?.esAdenda) registrar(destino, origen);
  }

  // Un ciclo (A padre de B y B padre de A) dejaría la tabla sin raíces: se corta.
  for (const hijo of Object.keys(padrePorHijo)) {
    const padre = padrePorHijo[hijo];
    if (padrePorHijo[padre] === hijo) delete padrePorHijo[hijo];
  }

  const hijosPorPadre: Record<string, string[]> = {};
  for (const [hijo, padre] of Object.entries(padrePorHijo)) {
    (hijosPorPadre[padre] ??= []).push(hijo);
  }

  return { padrePorHijo, hijosPorPadre };
}
