// Ver nota en entidades/predios/opciones.ts sobre por qué este archivo no
// lleva "use client".
import type { OpcionPill } from "@/components/ui/property-pill";

// `sustancia` tiene catálogo editable (`opciones_columna`, ver
// `src/lib/opciones-columna.ts`): estas son las opciones de arranque. El `value`
// ("metal", "no_metal") es lo guardado en la base y no cambia al renombrar; sólo
// cambia la etiqueta. Las sustancias nuevas se guardan con su propio nombre.
export const SUSTANCIA_OPCIONES: OpcionPill[] = [
  { value: "metal",    label: "Metal",    className: "bg-amber-500/15 text-amber-300" },
  { value: "no_metal", label: "No metal", className: "bg-white/10 text-white/60" },
];

// `estado` es texto libre: los `value` son los strings EXACTOS guardados en la
// base (ojo: "en Tramite", sin tilde y con T mayúscula). Si se escriben de otra
// forma la pastilla no marca el valor actual y el filtro no devuelve nada.
export const ESTADO_OPCIONES: OpcionPill[] = [
  { value: "titulada",   label: "Titulada",   className: "bg-brand-500/15 text-brand-300" },
  { value: "en Tramite", label: "En trámite", className: "bg-amber-500/15 text-amber-300" },
  { value: "cancelada",  label: "Cancelada",  className: "bg-red-500/15 text-red-300" },
];
