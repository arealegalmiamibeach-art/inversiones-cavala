"use client";

import { DocumentosList } from "../documentos-list";
import { TIPOS } from "../tipos";
import type { EntidadRelacion } from "@/lib/relaciones/contratos";
import type { PropiedadesPersonalizadasCargadas } from "@/lib/propiedades/personalizadas";

export type EntidadRelacionada = { tipo: string; nombre: string; href: string };
export type CopiaLiteral = {
  id: string; nombre: string; fecha: string | null; detalle: string | null;
  extra: Record<string, unknown> | null; relaciones?: EntidadRelacionada[];
};

/** Una copia literal es un documento: comparte todas sus propiedades y relaciones. */
export function CopiasLiteralesTable({ copias, count, adjuntosPorId, relacionesPorId, propiedadesIniciales }: {
  copias: CopiaLiteral[]; count: number; adjuntosPorId?: Record<string, number>;
  relacionesPorId: Record<string, EntidadRelacion[]>; propiedadesIniciales?: PropiedadesPersonalizadasCargadas;
}) {
  return <DocumentosList documentos={copias.map((c) => ({ ...c, tipo: "copia_literal" }))} tiposDisponibles={Object.keys(TIPOS)} count={count} adjuntosPorId={adjuntosPorId} relacionesPorId={relacionesPorId} propiedadesIniciales={propiedadesIniciales} tipoFijo="copia_literal" storageKey="documentos-copias-literales" />;
}
