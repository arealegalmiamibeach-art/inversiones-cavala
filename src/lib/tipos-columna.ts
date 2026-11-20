/**
 * Tipo real de las columnas NATIVAS que, como en Notion, se pueden convertir
 * entre Texto y Selección desde "Editar propiedad" (tabla `tipos_columna`).
 *
 * El tipo es de la propiedad, no de la vista: lo leen la tabla, la ficha
 * lateral y la página del registro. En la fila el dato sigue siendo texto en
 * los dos tipos, así que la conversión nunca reescribe registros — al pasar a
 * Selección cada valor que ya existe se siembra como opción en
 * `opciones_columna` (ver `convertirTipoColumna`).
 *
 * Las demás columnas nativas no entran: su render y su validación dependen
 * del tipo que trae el código.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type TipoColumnaNativa = "texto" | "seleccion";

export const TIPOS_CONVERTIBLES: TipoColumnaNativa[] = ["texto", "seleccion"];

/**
 * Columnas convertibles por `tabla.campo`, con el tipo que usan mientras nadie
 * lo cambie. Tiene que coincidir con el CHECK `tipos_columna_permitidas` y
 * cada una tiene que estar también en `CATALOGOS_COLUMNA`, que es donde viven
 * sus opciones cuando es Selección.
 */
export const COLUMNAS_CONVERTIBLES: Record<string, { tabla: string; campo: string; porDefecto: TipoColumnaNativa; rutas: string[] }> = {
};

export function columnaConvertible(tabla: string, campo: string) {
  return COLUMNAS_CONVERTIBLES[`${tabla}.${campo}`];
}

export function esTipoConvertible(tipo: string): tipo is TipoColumnaNativa {
  return (TIPOS_CONVERTIBLES as string[]).includes(tipo);
}

/**
 * Tipo vigente de cada columna convertible de la tabla, por campo. Si falta
 * aplicar la migración o la consulta falla, cada columna cae a su tipo por
 * defecto en vez de romper la vista.
 */
export async function cargarTiposColumna(
  supabase: SupabaseClient,
  tabla: string
): Promise<Record<string, TipoColumnaNativa>> {
  const tipos: Record<string, TipoColumnaNativa> = {};
  for (const columna of Object.values(COLUMNAS_CONVERTIBLES)) {
    if (columna.tabla === tabla) tipos[columna.campo] = columna.porDefecto;
  }

  const { data, error } = await supabase
    .from("tipos_columna")
    .select("campo, tipo")
    .eq("tabla", tabla);
  if (error) return tipos;

  for (const fila of data ?? []) {
    const campo = fila.campo as string;
    const tipo = fila.tipo as string;
    if (columnaConvertible(tabla, campo) && esTipoConvertible(tipo)) tipos[campo] = tipo;
  }
  return tipos;
}
