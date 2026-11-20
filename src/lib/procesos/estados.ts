/**
 * Catálogo editable de `procesos.estado` (tabla `estados_procesos`). El
 * valor en `procesos` sigue siendo texto libre; esto es sólo la lista de
 * opciones válidas que ofrece el desplegable, con color y materia: cada
 * materia tiene su propio conjunto (el mismo nombre puede repetirse en varias).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpcionPill } from "@/components/ui/property-pill";

export type EstadoProceso = {
  id: string;
  valor: string;
  claseColor: string;
  colorPunto: string;
  materia: string | null;
  orden: number;
  /** Procesos de esa materia que tienen hoy este estado. */
  usos: number;
};

/** Colores que se pueden elegir para un estado (los mismos de la migración original). */
export const COLORES_ESTADO = [
  { clave: "gris", nombre: "Gris", clase: "bg-white/10 text-white/50", punto: "rgba(255,255,255,0.35)" },
  { clave: "azul", nombre: "Azul", clase: "bg-blue-500/15 text-blue-300", punto: "#3b82f6" },
  { clave: "indigo", nombre: "Índigo", clase: "bg-indigo-500/15 text-indigo-300", punto: "#6366f1" },
  { clave: "celeste", nombre: "Celeste", clase: "bg-sky-500/15 text-sky-300", punto: "#0ea5e9" },
  { clave: "cian", nombre: "Cian", clase: "bg-cyan-500/15 text-cyan-300", punto: "#06b6d4" },
  { clave: "verde-azulado", nombre: "Verde azulado", clase: "bg-teal-500/15 text-teal-300", punto: "#14b8a6" },
  { clave: "verde", nombre: "Verde", clase: "bg-emerald-500/15 text-emerald-300", punto: "#10b981" },
  { clave: "ambar", nombre: "Ámbar", clase: "bg-amber-500/15 text-amber-300", punto: "#f59e0b" },
  { clave: "naranja", nombre: "Naranja", clase: "bg-orange-500/15 text-orange-300", punto: "#f97316" },
  { clave: "rojo", nombre: "Rojo", clase: "bg-red-500/15 text-red-300", punto: "#ef4444" },
  { clave: "rosa", nombre: "Rosa", clase: "bg-rose-500/15 text-rose-300", punto: "#f43f5e" },
  { clave: "violeta", nombre: "Violeta", clase: "bg-violet-500/15 text-violet-300", punto: "#8b5cf6" },
  { clave: "purpura", nombre: "Púrpura", clase: "bg-purple-500/15 text-purple-300", punto: "#a855f7" },
] as const;

/** Paleta para estados nuevos agregados desde la UI, elegida por hash del texto. */
const PALETA_ESTADO_NUEVO = (
  ["azul", "indigo", "celeste", "cian", "verde-azulado", "ambar", "violeta", "purpura", "naranja", "rosa"] as const
).map((clave) => COLORES_ESTADO.find((color) => color.clave === clave)!);

export function colorEstadoNuevo(valor: string): { clase: string; punto: string } {
  let hash = 0;
  for (let i = 0; i < valor.length; i += 1) hash = (hash * 31 + valor.charCodeAt(i)) >>> 0;
  const elegido = PALETA_ESTADO_NUEVO[hash % PALETA_ESTADO_NUEVO.length];
  return { clase: elegido.clase, punto: elegido.punto };
}

/** Cuántos procesos de cada materia tienen cada estado (clave `materia\u0000estado`). */
async function contarUsos(supabase: SupabaseClient): Promise<Map<string, number>> {
  const usos = new Map<string, number>();
  const lote = 1000;
  for (let desde = 0; ; desde += lote) {
    const { data, error } = await supabase
      .from("procesos")
      .select("materia, estado")
      .not("estado", "is", null)
      .order("id")
      .range(desde, desde + lote - 1);
    if (error) return usos;
    for (const fila of data ?? []) {
      const clave = `${fila.materia as string}\u0000${(fila.estado as string).trim().toLocaleLowerCase("es-PE")}`;
      usos.set(clave, (usos.get(clave) ?? 0) + 1);
    }
    if ((data ?? []).length < lote) return usos;
  }
}

/** Carga el catálogo completo. Si falta aplicar la migración, no rompe la vista. */
export async function cargarEstadosProcesos(supabase: SupabaseClient): Promise<EstadoProceso[]> {
  const [{ data, error }, usos] = await Promise.all([
    supabase
      .from("estados_procesos")
      .select("id, valor, clase_color, color_punto, materia, orden")
      .order("orden")
      .order("creado_en")
      .order("id"),
    contarUsos(supabase),
  ]);
  if (error) return [];

  return (data ?? []).map((fila) => {
    const materia = (fila.materia as string | null) ?? null;
    const valor = fila.valor as string;
    return {
      id: fila.id as string,
      valor,
      claseColor: fila.clase_color as string,
      colorPunto: fila.color_punto as string,
      materia,
      orden: (fila.orden as number | null) ?? 0,
      usos: materia ? usos.get(`${materia}\u0000${valor.trim().toLocaleLowerCase("es-PE")}`) ?? 0 : 0,
    };
  });
}

/**
 * Opciones para el `PropertyPill` de Estado: sólo las de esa materia. Las que
 * aún no tienen materia (catálogo anterior a la migración por materia) se
 * siguen ofreciendo en todas hasta que se aplique.
 */
export function opcionesEstadoPill(estados: EstadoProceso[], materia: string | null): OpcionPill[] {
  return estados
    .filter((estado) => estado.materia === null || estado.materia === materia)
    .map((estado) => ({ value: estado.valor, label: estado.valor, className: estado.claseColor, id: estado.id, usos: estado.usos }));
}

export function colorPuntoEstados(estados: EstadoProceso[]): Record<string, string> {
  return Object.fromEntries(estados.map((estado) => [estado.valor, estado.colorPunto]));
}
