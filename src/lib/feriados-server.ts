import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Feriados extraordinarios (tabla `feriados`): los puentes y duelos que el
 * gobierno declara cada año y que `lib/feriados.ts` no puede calcular.
 *
 * Si la tabla no existe todavía —la migración no se ha aplicado— devuelve
 * vacío: el cómputo de plazos sigue funcionando con los feriados fijos y la
 * Semana Santa en vez de romper la página.
 */
export async function cargarFeriados(supabase: SupabaseClient): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("feriados").select("fecha, nombre").eq("nacional", true);
  if (error) return new Map();
  return new Map((data ?? []).map((f) => [f.fecha as string, f.nombre as string]));
}
