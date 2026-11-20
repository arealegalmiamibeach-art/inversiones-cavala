// Datos planos compartidos entre el Server Component ([id]/page.tsx), el
// componente cliente (propietarios-table.tsx) y el alta (crear-registro.tsx).
// Deliberadamente SIN "use client": exportar un arreglo desde un módulo cliente
// y luego importarlo en un Server Component rompe el bundler de RSC.
import type { OpcionPill } from "@/components/ui/property-pill";

// `tipo_persona` tiene catálogo editable (`opciones_columna`, ver
// `src/lib/opciones-columna.ts`): estas son las opciones de arranque. El `value`
// ("natural", "juridica") es lo guardado en la base y no cambia al renombrar;
// sólo cambia la etiqueta. Los tipos nuevos se guardan con su propio nombre.
export const TIPO_PERSONA_OPCIONES: OpcionPill[] = [
  { value: "natural",  label: "Natural",  className: "bg-blue-500/15 text-blue-300" },
  { value: "juridica", label: "Jurídica", className: "bg-violet-500/15 text-violet-300" },
];
