// Ver nota en entidades/predios/opciones.ts sobre por qué este archivo no
// lleva "use client".
import type { OpcionPill } from "@/components/ui/property-pill";

export const TIPOS: Record<string, string> = {
  personal: "Personal",
  profesional: "Profesional",
  servicios: "MBP-Otros",
  mutuo: "Mutuo",
  arrendamiento: "Arrendamiento",
  concesiones: "Concesiones",
};

/**
 * Familias del índice de contratos: mismo orden y mismos nombres que el índice
 * de Notion que usa el cliente, para que reconozca sus carpetas de siempre.
 */
export const ORDEN_TIPOS = ["personal", "profesional", "servicios", "mutuo", "arrendamiento", "concesiones"] as const;

export const FAMILIA_LABEL: Record<string, string> = {
  personal: "Contratos de personal",
  profesional: "Contratos profesionales",
  servicios: "Contratos MBP-Otros",
  mutuo: "Contratos mutuos",
  arrendamiento: "Arrendamiento vehicular",
  concesiones: "Contratos de concesiones",
};

export const FAMILIA_DESCRIPCION: Record<string, string> = {
  personal: "Vínculo laboral del personal de Cavala.",
  profesional: "Locación de servicios profesionales.",
  servicios: "Servicios, proveedores y otros acuerdos.",
  mutuo: "Préstamos con acreedor y deudor.",
  arrendamiento: "Alquiler de vehículos y unidades.",
  concesiones: "Acuerdos sobre concesiones mineras.",
};

/** Etiqueta de familia; cae a la etiqueta corta si aparece un tipo nuevo. */
export function etiquetaFamilia(tipo: string) {
  return FAMILIA_LABEL[tipo] ?? TIPOS[tipo] ?? tipo;
}

export const TIPO_OPCIONES: OpcionPill[] = [
  { value: "personal",      label: "Personal",      className: "bg-blue-500/15 text-blue-300" },
  { value: "profesional",   label: "Profesional",   className: "bg-violet-500/15 text-violet-300" },
  { value: "servicios",     label: "MBP-Otros",     className: "bg-teal-500/15 text-teal-300" },
  { value: "mutuo",         label: "Mutuo",         className: "bg-orange-500/15 text-orange-300" },
  { value: "arrendamiento", label: "Arrendamiento", className: "bg-emerald-500/15 text-emerald-300" },
  { value: "concesiones",   label: "Concesiones",   className: "bg-amber-500/15 text-amber-300" },
];

export const MONEDA_OPCIONES: OpcionPill[] = [
  { value: "PEN", label: "S/ PEN",  className: "bg-emerald-500/15 text-emerald-300" },
  { value: "USD", label: "US$ USD", className: "bg-amber-500/15 text-amber-300" },
];

export const ESTADO_BASE_OPCIONES: OpcionPill[] = [
  { value: "Vigente",  label: "Vigente",  className: "bg-emerald-500/15 text-emerald-300" },
  { value: "Vencido",  label: "Vencido",  className: "bg-red-500/15 text-red-300" },
  { value: "Cesado",   label: "Cesado",   className: "bg-white/10 text-white/50" },
];
