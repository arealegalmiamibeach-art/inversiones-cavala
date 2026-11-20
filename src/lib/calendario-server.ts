import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ENTIDADES_PERSONALIZABLES,
  esTipoEntidadPersonalizable,
  type TipoEntidadPersonalizable,
} from "@/lib/propiedades/personalizadas";
import type { PropiedadFechaRow } from "@/lib/calendario";

type DefinicionFecha = {
  id: string;
  nombre: string;
  entidadTipo: TipoEntidadPersonalizable;
};

const ISO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** El valor llega como jsonb; sólo sirve si es "YYYY-MM-DD" (lo que guarda la acción). */
function fechaDeValor(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const texto = valor.trim().slice(0, 10);
  return ISO_FECHA.test(texto) ? texto : null;
}

/**
 * Valores de las propiedades personalizadas de tipo "fecha", ya con el nombre
 * del registro dueño. Qué se hace con cada una (calendario, aviso o nada) lo
 * decide "Fechas y avisos"; `propiedadIds` acota a unas pocas (las alertas).
 *
 * Tres consultas en total (definiciones + valores + nombres por tabla), nunca
 * una por fila. Si la tabla aún no existe, devuelve vacío en vez de romper.
 */
export async function cargarFechasPersonalizadas(
  supabase: SupabaseClient,
  opciones: { propiedadIds?: string[] } = {}
): Promise<PropiedadFechaRow[]> {
  if (opciones.propiedadIds && opciones.propiedadIds.length === 0) return [];
  let consulta = supabase
    .from("propiedades_personalizadas")
    .select("id, nombre, entidad_tipo")
    .eq("tipo", "fecha");
  if (opciones.propiedadIds) consulta = consulta.in("id", opciones.propiedadIds);
  const { data: definicionesData, error } = await consulta;

  if (error || !definicionesData?.length) return [];

  const definiciones = new Map<string, DefinicionFecha>();
  for (const fila of definicionesData as Record<string, unknown>[]) {
    if (
      typeof fila.id !== "string" ||
      typeof fila.nombre !== "string" ||
      typeof fila.entidad_tipo !== "string" ||
      !esTipoEntidadPersonalizable(fila.entidad_tipo)
    ) continue;
    definiciones.set(fila.id, { id: fila.id, nombre: fila.nombre, entidadTipo: fila.entidad_tipo });
  }
  if (definiciones.size === 0) return [];

  const { data: valoresData } = await supabase
    .from("valores_propiedad_personalizada")
    .select("propiedad_id, entidad_id, valor")
    .in("propiedad_id", Array.from(definiciones.keys()))
    .limit(5000);

  type ValorFecha = { definicion: DefinicionFecha; entidadId: string; fecha: string };
  const valores: ValorFecha[] = [];
  const idsPorTipo = new Map<TipoEntidadPersonalizable, Set<string>>();

  for (const fila of (valoresData ?? []) as { propiedad_id: string; entidad_id: string; valor: unknown }[]) {
    const definicion = definiciones.get(fila.propiedad_id);
    if (!definicion || typeof fila.entidad_id !== "string") continue;
    const fecha = fechaDeValor(fila.valor);
    if (!fecha) continue;
    valores.push({ definicion, entidadId: fila.entidad_id, fecha });
    const acumulados = idsPorTipo.get(definicion.entidadTipo) ?? new Set<string>();
    acumulados.add(fila.entidad_id);
    idsPorTipo.set(definicion.entidadTipo, acumulados);
  }
  if (valores.length === 0) return [];

  // Nombres de los registros dueños de cada fecha, una consulta por tabla. Lo
  // que no vuelve (eliminado o sin acceso) se omite. `eliminado_en` va
  // explícito porque el cron del correo usa la service-role y salta la RLS.
  const nombres = new Map<string, string>();
  await Promise.all(Array.from(idsPorTipo.entries()).map(async ([tipo, ids]) => {
    const config = ENTIDADES_PERSONALIZABLES[tipo];
    const { data } = await supabase
      .from(config.tabla)
      .select(["id", config.campoNombre].join(", "))
      .is("eliminado_en", null)
      .in("id", Array.from(ids));
    for (const fila of (data ?? []) as unknown as Record<string, unknown>[]) {
      if (typeof fila.id !== "string") continue;
      const nombre = fila[config.campoNombre];
      nombres.set(`${tipo}:${fila.id}`, typeof nombre === "string" && nombre.trim() ? nombre : config.singular);
    }
  }));

  const filas: PropiedadFechaRow[] = [];
  for (const { definicion, entidadId, fecha } of valores) {
    const clave = `${definicion.entidadTipo}:${entidadId}`;
    const entidadNombre = nombres.get(clave);
    if (!entidadNombre) continue; // registro eliminado o sin acceso
    const config = ENTIDADES_PERSONALIZABLES[definicion.entidadTipo];
    filas.push({
      propiedadId: definicion.id,
      propiedadNombre: definicion.nombre,
      entidadId,
      entidadLabel: config.singular,
      entidadNombre,
      href: `${config.href}/${entidadId}`,
      fecha,
    });
  }
  return filas;
}
