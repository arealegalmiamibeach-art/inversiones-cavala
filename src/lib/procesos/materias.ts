// Catálogo de materias judiciales: una sola fuente para el grid de tarjetas
// de /procesos, las rutas /procesos/materia/[materia] y el acento visual de
// cada materia. Las etiquetas cortas para los `PropertyPill` de la tabla
// siguen viviendo en `../../app/(dashboard)/procesos/opciones.ts` (no se
// tocó ese archivo para no arriesgar el estilo ya afinado de esa pill).
import {
  Landmark,
  Scale,
  ShieldAlert,
  Fingerprint,
  Building2,
  Briefcase,
  HardHat,
  Handshake,
  BookOpenText,
  Users2,
  LayoutGrid,
  type LucideIcon,
} from "lucide-react";

export type MateriaInfo = {
  clave: string;
  etiqueta: string;
  icono: LucideIcon;
  slug: string;
  color: { texto: string; fondo: string; borde: string; punto: string };
};

export const MATERIAS_CATALOGO: MateriaInfo[] = [
  { clave: "administrativo", etiqueta: "Administrativo", icono: Landmark, slug: "administrativo",
    color: { texto: "text-blue-300", fondo: "bg-blue-500/15", borde: "border-blue-400/25", punto: "bg-blue-400" } },
  { clave: "civil", etiqueta: "Civil", icono: Scale, slug: "civil",
    color: { texto: "text-violet-300", fondo: "bg-violet-500/15", borde: "border-violet-400/25", punto: "bg-violet-400" } },
  { clave: "penal", etiqueta: "Penal", icono: ShieldAlert, slug: "penal",
    color: { texto: "text-red-300", fondo: "bg-red-500/15", borde: "border-red-400/25", punto: "bg-red-400" } },
  { clave: "carpeta_fiscal", etiqueta: "Carpeta fiscal", icono: Fingerprint, slug: "carpeta_fiscal",
    color: { texto: "text-orange-300", fondo: "bg-orange-500/15", borde: "border-orange-400/25", punto: "bg-orange-400" } },
  { clave: "contencioso_administrativo", etiqueta: "Contencioso administrativo", icono: Building2, slug: "contencioso_administrativo",
    color: { texto: "text-indigo-300", fondo: "bg-indigo-500/15", borde: "border-indigo-400/25", punto: "bg-indigo-400" } },
  { clave: "laboral", etiqueta: "Laboral", icono: Briefcase, slug: "laboral",
    color: { texto: "text-teal-300", fondo: "bg-teal-500/15", borde: "border-teal-400/25", punto: "bg-teal-400" } },
  { clave: "sunafil", etiqueta: "SUNAFIL", icono: HardHat, slug: "sunafil",
    color: { texto: "text-amber-300", fondo: "bg-amber-500/15", borde: "border-amber-400/25", punto: "bg-amber-400" } },
  { clave: "conciliacion", etiqueta: "Conciliación", icono: Handshake, slug: "conciliacion",
    color: { texto: "text-emerald-300", fondo: "bg-emerald-500/15", borde: "border-emerald-400/25", punto: "bg-emerald-400" } },
  { clave: "constitucional", etiqueta: "Constitucional", icono: BookOpenText, slug: "constitucional",
    color: { texto: "text-pink-300", fondo: "bg-pink-500/15", borde: "border-pink-400/25", punto: "bg-pink-400" } },
  { clave: "direccion_trabajo", etiqueta: "Dirección de trabajo", icono: Users2, slug: "direccion_trabajo",
    color: { texto: "text-white/70", fondo: "bg-white/10", borde: "border-white/15", punto: "bg-white/50" } },
];

const POR_CLAVE: Record<string, MateriaInfo> = Object.fromEntries(MATERIAS_CATALOGO.map((m) => [m.clave, m]));
const POR_SLUG: Record<string, MateriaInfo> = Object.fromEntries(MATERIAS_CATALOGO.map((m) => [m.slug, m]));

/** Slug reservado para la vista "todos los procesos" bajo la misma ruta dinámica. */
export const SLUG_TODAS = "todas";

const MATERIA_DESCONOCIDA_ICONO = LayoutGrid;

/**
 * `etiquetas` viene del catálogo editable (`opciones_columna`, campo
 * `procesos.materia`): renombrar una materia desde "Editar propiedad" sólo
 * cambia el texto que se muestra, nunca `clave`, así que ícono, color y
 * slug de ruta siguen viniendo del catálogo fijo de abajo.
 */
export function materiaInfo(clave: string, etiquetas?: Record<string, string>): MateriaInfo {
  const info = POR_CLAVE[clave] ?? {
    clave,
    etiqueta: clave,
    icono: MATERIA_DESCONOCIDA_ICONO,
    slug: clave,
    color: { texto: "text-white/70", fondo: "bg-white/10", borde: "border-white/15", punto: "bg-white/50" },
  };
  const etiqueta = etiquetas?.[clave];
  return etiqueta ? { ...info, etiqueta } : info;
}

export function materiaPorSlug(slug: string): MateriaInfo | undefined {
  return POR_SLUG[slug];
}

/** Quita tildes y pasa a minúsculas: la data migrada mezcla mayúsculas/acentos inconsistentes. */
const MARCAS_DIACRITICAS = /[\u0300-\u036f]/g;

export function normalizarTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(MARCAS_DIACRITICAS, "")
    .toLocaleLowerCase("es-PE")
    .trim();
}
