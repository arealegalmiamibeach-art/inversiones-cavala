// Cálculos puros del reporte de procesos judiciales. Separado de page.tsx
// para que la lectura de datos, el filtrado y las agregaciones no queden
// todas mezcladas en el componente de servidor.
//
import { extraerFechasComoDate } from "@/lib/procesos/diligencias";
import { ESTADOS_CERRADOS } from "@/lib/procesos/resumen";

export type ProcesoReporte = {
  id: string;
  materia: string;
  expediente: string | null;
  asunto: string | null;
  estado: string | null;
  descripcion: string | null;
  juzgado: string | null;
  abogado: string | null;
  estudio: string | null;
  diligencia: string | null;
};

export const MATERIAS: Record<string, string> = {
  administrativo: "Administrativo",
  civil: "Civil",
  penal: "Penal",
  carpeta_fiscal: "Carpeta Fiscal",
  contencioso_administrativo: "Contencioso Adm.",
  laboral: "Laboral",
  sunafil: "SUNAFIL",
  conciliacion: "Conciliación",
  constitucional: "Constitucional",
  direccion_trabajo: "Dirección de Trabajo",
};

// Paleta fija (no depende de las clases Tailwind del shell oscuro) pensada
// para leerse bien impresa sobre fondo blanco con print-color-adjust: exact.
export const MATERIA_COLOR: Record<string, string> = {
  administrativo: "#2563eb",
  civil: "#7c3aed",
  penal: "#dc2626",
  carpeta_fiscal: "#ea580c",
  contencioso_administrativo: "#4f46e5",
  laboral: "#0d9488",
  sunafil: "#d97706",
  conciliacion: "#059669",
  constitucional: "#db2777",
  direccion_trabajo: "#475569",
};

// `estado` ya no es texto libre: desde la migración
// 20260916160000_estado_procesos_vocabulario_real.sql guarda el vocabulario
// cerrado de cada materia, así que basta comprobar la lista de cierre en vez de
// adivinar por palabras. Un proceso sin estado (las materias que no lo manejan)
// se cuenta como en curso, igual que antes.
export function esConcluido(estado: string | null): boolean {
  return Boolean(estado) && ESTADOS_CERRADOS.has(estado!.trim());
}

function fechasDelProceso(proceso: ProcesoReporte): Date[] {
  return extraerFechasComoDate(`${proceso.diligencia ?? ""} ${proceso.descripcion ?? ""}`.trim());
}

/** Próxima fecha futura (>= hoy) mencionada en diligencia/descripción, o null si no hay ninguna. */
export function proximaDiligencia(proceso: ProcesoReporte, hoy = new Date()): Date | null {
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const futuras = fechasDelProceso(proceso)
    .filter((f) => f.getTime() >= inicioHoy.getTime())
    .sort((a, b) => a.getTime() - b.getTime());
  return futuras[0] ?? null;
}

export function resumirDescripcion(descripcion: string | null, maxLargo = 160): string {
  if (!descripcion) return "—";
  const primeraLinea = descripcion.split("\n").find((l) => l.trim().length > 0) ?? descripcion;
  return primeraLinea.length > maxLargo ? `${primeraLinea.slice(0, maxLargo).trim()}…` : primeraLinea.trim();
}

export type ConteoMateria = { materia: string; label: string; total: number; enCurso: number; pctTotal: number; pctEnCurso: number };

export function agruparPorMateria(procesos: ProcesoReporte[]): ConteoMateria[] {
  const total = procesos.length || 1;
  const mapa = new Map<string, { total: number; enCurso: number }>();
  for (const p of procesos) {
    const actual = mapa.get(p.materia) ?? { total: 0, enCurso: 0 };
    actual.total += 1;
    if (!esConcluido(p.estado)) actual.enCurso += 1;
    mapa.set(p.materia, actual);
  }
  return Array.from(mapa.entries())
    .map(([materia, { total: t, enCurso }]) => ({
      materia,
      label: MATERIAS[materia] ?? materia,
      total: t,
      enCurso,
      pctTotal: Math.round((t / total) * 1000) / 10,
      pctEnCurso: t > 0 ? Math.round((enCurso / t) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

export type ConteoEstado = { estado: string; total: number };

export function agruparPorEstado(procesos: ProcesoReporte[]): ConteoEstado[] {
  const mapa = new Map<string, number>();
  for (const p of procesos) {
    const estado = (p.estado ?? "").trim();
    // Administrativo, Carpeta Fiscal, Laboral, Conciliación, SUNAFIL y Dirección
    // de Trabajo no manejan estado: caen todas en "Sin estado" a propósito.
    mapa.set(estado || "Sin estado", (mapa.get(estado || "Sin estado") ?? 0) + 1);
  }
  return Array.from(mapa.entries())
    .map(([estado, total]) => ({ estado, total }))
    .sort((a, b) => b.total - a.total);
}

export function procesosIncompletos(procesos: ProcesoReporte[]): ProcesoReporte[] {
  return procesos.filter((p) => !p.expediente?.trim() || !p.juzgado?.trim() || !p.abogado?.trim());
}
