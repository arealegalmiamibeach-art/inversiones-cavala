// Ver nota en entidades/predios/opciones.ts sobre por qué este archivo no
// lleva "use client".
import type { OpcionPill } from "@/components/ui/property-pill";

// La definición de "cerrado" vive junto a `esEnCurso`, en lib/procesos/resumen.
export { ESTADOS_CERRADOS } from "@/lib/procesos/resumen";

export const MATERIAS: Record<string, string> = {
  administrativo: "Administrativo",
  civil: "Civil",
  penal: "Penal",
  carpeta_fiscal: "Carpeta Fiscal",
  contencioso_administrativo: "Contencioso Adm.",
  laboral: "Laboral",
  sunafil: "SUNAFIL",
  conciliacion: "Conciliación",
  constitucional: "Constitucional",
  direccion_trabajo: "Dirección de Trabajo",
};

// El vocabulario de `procesos.estado` ya no vive aquí: es un catálogo
// editable en la tabla `estados_procesos` (ver lib/procesos/estados.ts).

export const MATERIA_OPCIONES: OpcionPill[] = [
  { value: "administrativo",             label: "Administrativo",   className: "bg-blue-500/15 text-blue-300" },
  { value: "civil",                      label: "Civil",            className: "bg-violet-500/15 text-violet-300" },
  { value: "penal",                      label: "Penal",            className: "bg-red-500/15 text-red-300" },
  { value: "carpeta_fiscal",             label: "Carpeta Fiscal",   className: "bg-orange-500/15 text-orange-300" },
  { value: "contencioso_administrativo", label: "Contencioso Adm.", className: "bg-indigo-500/15 text-indigo-300" },
  { value: "laboral",                    label: "Laboral",          className: "bg-teal-500/15 text-teal-300" },
  { value: "sunafil",                    label: "SUNAFIL",          className: "bg-amber-500/15 text-amber-300" },
  { value: "conciliacion",               label: "Conciliación",     className: "bg-emerald-500/15 text-emerald-300" },
  { value: "constitucional",             label: "Constitucional",   className: "bg-pink-500/15 text-pink-300" },
  { value: "direccion_trabajo",          label: "Dirección de Trabajo", className: "bg-white/10 text-white/60" },
];
