/**
 * Nombres que una propiedad personalizada no puede usar porque ya los lleva
 * una columna NATIVA de la tabla (Expediente, Abogado, Estado…).
 *
 * Si esa columna nativa está eliminada (`propiedades_nativas_eliminadas`), su
 * nombre queda libre: así una propiedad nueva —por ejemplo "Abogado" con
 * opciones seleccionables— puede reemplazarla. A cambio, la nativa no se
 * puede restaurar mientras exista una personalizada con su nombre, para que
 * nunca convivan dos columnas iguales.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Nombre normalizado → `campo` de la columna nativa de procesos que lo lleva.
 * `null`: el nombre está reservado pero no corresponde a una columna que se
 * pueda eliminar, así que nunca se libera.
 */
const NOMBRES_RESERVADOS: ReadonlyMap<string, string | null> = new Map([
  ["expediente", "expediente"],
  ["proxima diligencia", "proxima_diligencia"],
  ["materia", "materia"],
  ["estado", "estado"],
  ["asunto", "asunto"],
  ["juzgado", null],
  ["abogado", "abogado"],
  ["estudio", "estudio"],
  ["diligencia", "diligencia"],
  ["descripcion", "descripcion"],
  ["propietarios", null],
  ["predios", null],
  ["vehiculos", null],
  ["archivos", "adjuntos"],
  ["acciones", null],
]);

/** Las columnas nativas de la lista son las de la tabla de procesos. */
const ENTIDAD_COLUMNAS_NATIVAS = "proceso";

export function claveNombrePropiedad(nombre: string) {
  return nombre.trim().replace(/\s+/g, " ").normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es-PE");
}

async function nativaEliminada(supabase: SupabaseClient, entidadTipo: string, campo: string) {
  const { data, error } = await supabase
    .from("propiedades_nativas_eliminadas")
    .select("campo")
    .eq("entidad_tipo", entidadTipo)
    .eq("campo", campo)
    .maybeSingle();
  return !error && Boolean(data);
}

/**
 * `true` si `nombre` no se puede usar en una propiedad personalizada de
 * `entidadTipo`: es de una columna nativa y esa columna sigue activa.
 */
export async function nombrePropiedadReservado(supabase: SupabaseClient, entidadTipo: string, nombre: string) {
  const clave = claveNombrePropiedad(nombre);
  if (!NOMBRES_RESERVADOS.has(clave)) return false;
  const campo = NOMBRES_RESERVADOS.get(clave);
  if (!campo || entidadTipo !== ENTIDAD_COLUMNAS_NATIVAS) return true;
  return !await nativaEliminada(supabase, entidadTipo, campo);
}

/**
 * Nombre de la propiedad personalizada que hoy ocupa el nombre de la columna
 * nativa `campo`, o `null` si no hay ninguna (y por tanto se puede restaurar).
 */
export async function personalizadaQueOcupaNativa(supabase: SupabaseClient, entidadTipo: string, campo: string): Promise<string | null> {
  if (entidadTipo !== ENTIDAD_COLUMNAS_NATIVAS) return null;
  const claves = Array.from(NOMBRES_RESERVADOS).filter(([, valor]) => valor === campo).map(([clave]) => clave);
  if (claves.length === 0) return null;

  const { data, error } = await supabase
    .from("propiedades_personalizadas")
    .select("nombre")
    .eq("entidad_tipo", entidadTipo);
  if (error) return null;
  const ocupada = (data ?? []).find((fila) => claves.includes(claveNombrePropiedad(String(fila.nombre))));
  return ocupada ? String(ocupada.nombre) : null;
}
