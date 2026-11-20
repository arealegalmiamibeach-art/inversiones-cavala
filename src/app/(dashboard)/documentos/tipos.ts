// Datos planos compartidos entre el Server Component (page.tsx, [id]/page.tsx)
// y el componente cliente (documentos-list.tsx). Deliberadamente SIN "use
// client": exportar un objeto/arreglo desde un módulo cliente y luego
// importarlo en un Server Component rompe el bundler de RSC ("Could not find
// the module ... in the React Client Manifest").
export const TIPOS: Record<string, string> = {
  copia_literal: "Copia Literal",
  testimonio: "Testimonio",
  vigencia_poder: "Vigencia de Poder",
  junta_general: "Junta General",
  minuta: "Minuta",
  multa: "Multa",
  documento_municipal: "Documento Municipal",
  constancia_posesion: "Constancia de Posesión",
  titulo_archivado: "Título Archivado",
  habilitacion_urbana: "Habilitación Urbana",
  plano: "Plano",
  memoria_tecnica: "Memoria Técnica",
  tarjeta_identificacion: "Tarjeta de Identificación",
  poliza: "Póliza",
  reporte: "Reporte",
};

/** Tipos que hoy tienen registros importados, ordenados por uso legal. */
export const TIPOS_NAVEGACION = [
  { value: "testimonio", label: "Testimonios" },
  { value: "titulo_archivado", label: "Títulos archivados" },
  { value: "minuta", label: "Minutas" },
  { value: "vigencia_poder", label: "Vigencias de poder" },
  { value: "junta_general", label: "Juntas generales" },
  { value: "documento_municipal", label: "Documentos municipales" },
  { value: "constancia_posesion", label: "Constancias de posesión" },
  { value: "multa", label: "Multas" },
  { value: "habilitacion_urbana", label: "Habilitación urbana" },
  { value: "reporte", label: "Reportes" },
] as const;

export function rutaTipoDocumento(tipo: string) {
  return tipo === "copia_literal" ? "/documentos/copias-literales" : `/documentos/tipos/${tipo}`;
}
