"use client";

import { useState } from "react";
import Link from "next/link";
import type { RecordColumn } from "@/components/ui/records-table";
import type { EntidadRelacion } from "@/lib/relaciones/contratos";
import { BotonMasChips, CHIPS_VISIBLES, RelacionField } from "./relacion-field";

/**
 * Columnas de relación (`vinculos`) que comparten todas las tablas: una por
 * tipo de entidad. Así
 * tabla, panel lateral y ficha muestran las mismas relaciones.
 */
export const TIPOS_RELACION_TABLA: { tipo: string; label: string }[] = [
  { tipo: "propietario",       label: "Propietarios" },
  { tipo: "predio",            label: "Predios" },
  { tipo: "vehiculo",          label: "Vehículos" },
  { tipo: "concesion",         label: "Concesiones" },
  { tipo: "personal",          label: "Personal" },
  { tipo: "documento",         label: "Documentos" },
  { tipo: "contrato",          label: "Contratos" },
  { tipo: "proceso",           label: "Procesos" },
  { tipo: "oficina_registral", label: "Oficinas registrales" },
];

export function RelacionChips({ relaciones, conTipo = false }: { relaciones: EntidadRelacion[]; conTipo?: boolean }) {
  const [expandido, setExpandido] = useState(false);
  if (relaciones.length === 0) return <span className="text-white/35">—</span>;
  const visibles = expandido ? relaciones : relaciones.slice(0, CHIPS_VISIBLES);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {visibles.map((relacion) => (
        <Link
          key={relacion.id}
          href={relacion.href}
          onClick={(e) => e.stopPropagation()}
          title={`${relacion.entidadTipoLabel}: ${relacion.entidadNombre}`}
          className="glass-chip"
        >
          {conTipo && <span className="mr-1 text-white/45">{relacion.entidadTipoLabel}</span>}
          {relacion.entidadNombre}
        </Link>
      ))}
      <BotonMasChips ocultos={relaciones.length - CHIPS_VISIBLES} expandido={expandido} onAlternar={() => setExpandido((v) => !v)} />
    </div>
  );
}

type OpcionesColumnasRelacion<Row> = {
  entidadTipo: string;
  relacionesPorId: Record<string, EntidadRelacion[]>;
  idDe: (row: Row) => string;
  /** Tipos que la tabla ya muestra con su propia columna (o su propio tipo). */
  excluir?: string[];
};

/** Una columna `rel_<tipo>` por cada tipo de entidad relacionable. */
export function columnasRelacion<Row>({ entidadTipo, relacionesPorId, idDe, excluir = [] }: OpcionesColumnasRelacion<Row>): RecordColumn<Row>[] {
  const de = (row: Row, tipo: string) => (relacionesPorId[idDe(row)] ?? []).filter((r) => r.entidadTipo === tipo);
  return TIPOS_RELACION_TABLA.filter((rel) => !excluir.includes(rel.tipo) || rel.tipo === entidadTipo && Object.values(relacionesPorId).some((lista) => lista.some((r) => r.entidadTipo === rel.tipo))).map((rel) => ({
    id: `rel_${rel.tipo}`,
    label: rel.label,
    render: (row) => <RelacionField entidadTipo={entidadTipo} entidadId={idDe(row)} tipo={rel.tipo} relaciones={de(row, rel.tipo)} />,
    sortValue: (row) => de(row, rel.tipo).length,
    filterValue: (row) => de(row, rel.tipo).map((r) => r.entidadNombre).join(" "),
    tipo: "relacion",
    tipoFijo: true,
    stopRowClick: true,
  }));
}

/**
 * Ids de columna `rel_<tipo>` que no tienen ni un solo dato en `relacionesPorId`
 * (por ejemplo "Concesiones" en la tabla de Multas, que nunca se usa). Para
 * pasar a `defaultHidden`: quedan ocultas al abrir la tabla mientras no haya
 * nada que mostrar, pero siguen disponibles en "Propiedades" para activarlas
 * el día que alguien necesite vincular ese tipo.
 */
export function columnasRelacionVacias(relacionesPorId: Record<string, EntidadRelacion[]>): string[] {
  const presentes = new Set<string>();
  for (const lista of Object.values(relacionesPorId)) {
    for (const relacion of lista) presentes.add(relacion.entidadTipo);
  }
  return TIPOS_RELACION_TABLA.filter((rel) => !presentes.has(rel.tipo)).map((rel) => `rel_${rel.tipo}`);
}
