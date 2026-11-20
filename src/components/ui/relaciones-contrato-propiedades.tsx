"use client";

import { Network } from "lucide-react";
import { EntityPropertyRow } from "./entity-sheet";
import { RelacionField } from "./relacion-field";
import type { EntidadRelacion } from "@/lib/relaciones/contratos";
import { columnasRelacionesContrato, relacionesDeColumna } from "@/lib/relaciones/columnas";

export function RelacionesContratoPropiedades({ id, tipo, relaciones }: { id: string; tipo: string; relaciones: EntidadRelacion[] }) {
  return <>{columnasRelacionesContrato(relaciones, [tipo]).map((columna) => <EntityPropertyRow key={columna.clave} icon={<Network className="h-3.5 w-3.5" />} label={columna.label} campo={`relacion:${columna.clave}`} align="start">
    <RelacionField entidadTipo="contrato" entidadId={id} tipo={columna.tipo} rol={columna.rol ?? null} label={columna.label} relaciones={relacionesDeColumna(relaciones, columna)} />
  </EntityPropertyRow>)}</>;
}
