"use client";

import { PropertyPill, type OpcionPill } from "@/components/ui/property-pill";

/** La selección original de Notion. "Firma legalizada" es otro campo de texto. */
export const LEGALIZADO_OPCIONES: OpcionPill[] = [
  { value: "SI", label: "SI", className: "bg-emerald-500/15 text-emerald-200" },
  { value: "NO", label: "NO", className: "bg-white/[0.08] text-white/65" },
  { value: "Notaria", label: "Notaria", className: "bg-amber-500/15 text-amber-200" },
];

/**
 * Legalizado y Firma legalizada eran dos propiedades diferentes en Notion.
 * Legalizado conserva exclusivamente su selección cerrada; las fechas y notas
 * se muestran en la propiedad importada de texto "Firma legalizada" (o "Fecha
 * de legalización" para servicios).
 */
export function CampoLegalizado({
  id,
  valor,
  revalidar,
  enTabla = false,
}: {
  id: string;
  valor: string | null;
  revalidar: string;
  /** En la celda de la tabla: pastilla recortada a una línea y edición en línea. */
  enTabla?: boolean;
}) {
  return (
    <PropertyPill
      tabla="contratos"
      id={id}
      campo="legalizado"
      valor={valor}
      opciones={LEGALIZADO_OPCIONES}
      revalidar={revalidar}
      truncar={enTabla}
    />
  );
}
