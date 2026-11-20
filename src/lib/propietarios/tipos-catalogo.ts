import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpcionPill } from "@/components/ui/property-pill";

/** Tipo personalizado del catálogo `tipos_propietario`, con cuántos propietarios lo usan hoy. */
export type TipoPropietarioCatalogo = { id: string; nombre: string; usos: number };

/** Clase de color de los tipos personalizados (la misma en tabla, panel, ficha y editor). */
export const CLASE_TIPO_PERSONALIZADO = "bg-cyan-500/15 text-cyan-200";

/**
 * Propio y Tercero viven en `es_propio` (históricos): no se renombran, no se
 * eliminan ni se reordenan, por eso van con `fija`.
 */
export const ES_PROPIO_OPCIONES: OpcionPill[] = [
  { value: "true",  label: "Propio",  className: "bg-brand-500/15 text-brand-300", fija: true },
  { value: "false", label: "Tercero", className: "bg-white/10 text-white/60", fija: true },
];

/** Nombres que ya ocupan Propio y Tercero: ningún tipo personalizado puede llamarse así. */
export function esNombreTipoFijo(nombre: string): boolean {
  const normalizado = nombre.trim().toLocaleLowerCase("es-PE");
  return ES_PROPIO_OPCIONES.some((opcion) => opcion.label.toLocaleLowerCase("es-PE") === normalizado);
}

/**
 * Catálogo completo en el orden que eligió el usuario. Si falta aplicar la
 * migración (`orden`), cae al orden por nombre de siempre; los usos quedan en 0
 * si la consulta falla, para no romper la vista.
 */
export async function cargarTiposPropietario(supabase: SupabaseClient): Promise<TipoPropietarioCatalogo[]> {
  let filas: { id: unknown; nombre: unknown }[] | null = null;

  const ordenado = await supabase.from("tipos_propietario").select("id, nombre").order("orden").order("nombre");
  if (!ordenado.error) {
    filas = ordenado.data;
  } else {
    const porNombre = await supabase.from("tipos_propietario").select("id, nombre").order("nombre");
    if (porNombre.error) return [];
    filas = porNombre.data;
  }

  const usosPorNombre = new Map<string, number>();
  const { data: usados } = await supabase
    .from("propietarios")
    .select("tipo:extra->>tipo_propietario")
    .not("extra->>tipo_propietario", "is", null);
  for (const fila of (usados ?? []) as { tipo: string | null }[]) {
    const clave = (fila.tipo ?? "").trim().toLocaleLowerCase("es-PE");
    if (clave) usosPorNombre.set(clave, (usosPorNombre.get(clave) ?? 0) + 1);
  }

  return (filas ?? [])
    .map((fila) => ({ id: String(fila.id ?? ""), nombre: String(fila.nombre ?? "") }))
    .filter((fila) => fila.id && fila.nombre)
    .map((fila) => ({ ...fila, usos: usosPorNombre.get(fila.nombre.trim().toLocaleLowerCase("es-PE")) ?? 0 }));
}

/**
 * Opciones de la pastilla "Tipo": Propio y Tercero fijos y, detrás, los tipos
 * personalizados con su id (para renombrar/eliminar/reordenar) y sus usos.
 */
export function opcionesTipoPropietario(tipos: TipoPropietarioCatalogo[]): OpcionPill[] {
  return [
    ...ES_PROPIO_OPCIONES,
    ...tipos
      .filter((tipo) => !esNombreTipoFijo(tipo.nombre))
      .map((tipo) => ({ value: tipo.nombre, label: tipo.nombre, className: CLASE_TIPO_PERSONALIZADO, id: tipo.id, usos: tipo.usos })),
  ];
}
