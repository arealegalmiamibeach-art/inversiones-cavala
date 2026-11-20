// Datos planos compartidos entre el Server Component ([id]/page.tsx) y el
// componente cliente (predios-table.tsx). Deliberadamente SIN "use client":
// exportar un arreglo desde un módulo cliente y luego importarlo en un Server
// Component rompe el bundler de RSC ("Could not find the module ... in the
// React Client Manifest").
import type { OpcionPill } from "@/components/ui/property-pill";

export const TIPO_PREDIO_OPCIONES: OpcionPill[] = [
  { value: "urbano", label: "Urbano", className: "bg-blue-500/15 text-blue-300" },
  { value: "rural",  label: "Rural",  className: "bg-emerald-500/15 text-emerald-300" },
];

export const REGISTRADO_OPCIONES: OpcionPill[] = [
  { value: "true",  label: "Registrado",    className: "bg-brand-500/15 text-brand-300" },
  { value: "false", label: "No registrado", className: "bg-white/10 text-white/60" },
];

// `a_nombre_de` es texto libre: los valores son los que trajo la migración.
export const A_NOMBRE_DE_OPCIONES: OpcionPill[] = [
  { value: "inscrito a nuestro nombre",  label: "Nuestro nombre", className: "bg-emerald-500/15 text-emerald-300" },
  { value: "inscrito a nombre de 3ros",  label: "De terceros",    className: "bg-amber-500/15 text-amber-300" },
];

export const SI_NO_OPCIONES: OpcionPill[] = [
  { value: "true",  label: "Sí", className: "bg-emerald-500/15 text-emerald-300" },
  { value: "false", label: "No", className: "bg-white/10 text-white/50" },
];
