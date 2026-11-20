/**
 * Resumen de procesos por materia: alimenta las tarjetas de /procesos y las
 * cabeceras de /procesos/materia/[materia]. Prioriza los eventos registrados;
 * usa las fechas del texto libre sólo cuando no hay eventos vinculados.
 */
import {
  diligenciasEnVentana,
  diasHasta,
  hoyISO,
  type NivelUrgencia,
} from "./diligencias";
import { normalizarTexto } from "./materias";
import { proximaDiligenciaRegistrada, type EventoProceso } from "./eventos";

export type ProcesoResumen = {
  id?: string;
  materia: string;
  estado?: string | null;
  diligencia?: string | null;
  descripcion?: string | null;
};

export type ResumenMateria = {
  materia: string;
  total: number;
  enCurso: number;
  porcentajeEnCurso: number;
  /** Diligencias detectadas que caen dentro de los próximos 30 días. */
  diligenciasProximoMes: number;
  /** Procesos cuya próxima diligencia ya venció o cae dentro de 7 días. */
  criticos: number;
  /** Procesos cuya próxima diligencia cae entre 8 y 30 días. */
  proximos: number;
};

/**
 * Estados que significan que el expediente llegó al archivo. Es la única
 * definición de "cerrado" del sistema: antes esto se adivinaba con dos
 * heurísticas de texto distintas —una aquí y otra en el reporte PDF— que daban
 * resultados contradictorios sobre las mismas filas. Desde la migración
 * 20260916160000_estado_procesos_vocabulario_real.sql el vocabulario es cerrado
 * y basta con enumerarlo.
 */
export const ESTADOS_CERRADOS = new Set(["ARCHIVADO", "ARCHIVO"]);

/**
 * En curso = el proceso no está archivado. Un proceso sin estado cuenta como en
 * curso: las materias que no manejan estado (administrativo, carpeta fiscal,
 * laboral, conciliación, SUNAFIL y dirección de trabajo) lo tienen siempre vacío.
 */
export function esEnCurso(estado: string | null | undefined): boolean {
  const texto = (estado ?? "").trim();
  if (!texto) return true;
  return !ESTADOS_CERRADOS.has(texto);
}

export const DIAS_PROXIMO_MES = 30;

export function resumirMateria(procesos: ProcesoResumen[], desde = hoyISO(), eventosPorProceso: Record<string, EventoProceso[]> = {}): Omit<ResumenMateria, "materia"> {
  let enCurso = 0;
  let diligenciasProximoMes = 0;
  let criticos = 0;
  let proximos = 0;

  for (const proceso of procesos) {
    if (esEnCurso(proceso.estado)) enCurso += 1;
    const eventos = eventosPorProceso[proceso.id ?? ""] ?? [];
    diligenciasProximoMes += eventos.length ? eventos.filter((e) => e.estado === "PENDIENTE" && e.fecha >= desde && diasHasta(e.fecha, desde) <= DIAS_PROXIMO_MES).length : diligenciasEnVentana(proceso, DIAS_PROXIMO_MES, desde).length;
    const proxima = proximaDiligenciaRegistrada(proceso, eventos, desde);
    if (proxima?.nivel === "vencida" || proxima?.nivel === "critica") criticos += 1;
    else if (proxima?.nivel === "proxima") proximos += 1;
  }

  return {
    total: procesos.length,
    enCurso,
    porcentajeEnCurso: procesos.length ? Math.round((enCurso / procesos.length) * 100) : 0,
    diligenciasProximoMes,
    criticos,
    proximos,
  };
}

/** Agrupa por materia y devuelve el resumen de cada una, de mayor a menor total. */
export function resumirPorMateria(procesos: ProcesoResumen[], desde = hoyISO(), eventosPorProceso: Record<string, EventoProceso[]> = {}): ResumenMateria[] {
  const porMateria = new Map<string, ProcesoResumen[]>();
  for (const proceso of procesos) {
    const lista = porMateria.get(proceso.materia);
    if (lista) lista.push(proceso);
    else porMateria.set(proceso.materia, [proceso]);
  }

  return Array.from(porMateria.entries())
    .map(([materia, lista]) => ({ materia, ...resumirMateria(lista, desde, eventosPorProceso) }))
    .sort((a, b) => b.total - a.total || a.materia.localeCompare(b.materia, "es-PE"));
}

export const CLASES_URGENCIA: Record<NivelUrgencia, { texto: string; fondo: string; borde: string; punto: string; etiqueta: string }> = {
  vencida: { texto: "text-red-300", fondo: "bg-red-500/15", borde: "border-red-400/30", punto: "bg-red-400", etiqueta: "Vencida" },
  critica: { texto: "text-red-300", fondo: "bg-red-500/15", borde: "border-red-400/30", punto: "bg-red-400", etiqueta: "Urgente" },
  proxima: { texto: "text-amber-300", fondo: "bg-amber-500/15", borde: "border-amber-400/30", punto: "bg-amber-400", etiqueta: "Próxima" },
  normal: { texto: "text-white/70", fondo: "bg-white/[0.06]", borde: "border-white/10", punto: "bg-white/40", etiqueta: "Programada" },
};

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];

/** "2026-03-12" → "12 mar 2026" (sin depender de Intl para que servidor y cliente coincidan). */
export function formatearFechaCorta(fechaISO: string): string {
  const [anio, mes, dia] = fechaISO.split("-").map(Number);
  return `${dia} ${MESES_CORTOS[(mes ?? 1) - 1] ?? ""} ${anio}`;
}

/** "en 5 días" · "hoy" · "hace 3 días". */
export function textoDias(dias: number): string {
  if (dias === 0) return "hoy";
  if (dias === 1) return "mañana";
  if (dias > 0) return `en ${dias} días`;
  const pasados = Math.abs(dias);
  return `hace ${pasados} día${pasados === 1 ? "" : "s"}`;
}
