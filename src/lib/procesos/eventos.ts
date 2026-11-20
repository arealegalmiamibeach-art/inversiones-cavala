/**
 * Diligencias / audiencias reales de un proceso: filas de la tabla `eventos`
 * enlazadas al proceso por `vinculos` (destino_tipo = 'evento').
 *
 * Convive con el parser de texto libre de `diligencias.ts`: lo que el abogado
 * registra aquí es la fuente de verdad; las fechas detectadas en
 * `procesos.diligencia` quedan como pista secundaria ("detectadas en el texto").
 *
 * Sin `server-only`: los helpers de fecha los usan tanto el Server Component de
 * la ficha como el panel de cliente que da de alta las diligencias.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRowsIn } from "@/lib/supabase/fetch-all";
import { proximaDiligencia } from "./diligencias";
import { partesDeProceso } from "./partes";
import { diasHasta, nivelUrgencia, type NivelUrgencia } from "./diligencias";

/** Perú no tiene horario de verano: siempre UTC-5. */
const OFFSET_PERU = "-05:00";

/**
 * Ciclo de vida de una diligencia. Mientras esté PENDIENTE sigue avisando
 * aunque su fecha ya haya pasado: una audiencia a la que nadie fue es
 * precisamente lo que el sistema no puede dejar de mostrar.
 */
export const ESTADOS_DILIGENCIA = {
  PENDIENTE: "Pendiente",
  REALIZADA: "Realizada",
  REPROGRAMADA: "Reprogramada",
  INCUMPLIDA: "No se atendió",
  CANCELADA: "Cancelada",
} as const;

export type EstadoDiligencia = keyof typeof ESTADOS_DILIGENCIA;

export function esEstadoDiligencia(valor: unknown): valor is EstadoDiligencia {
  return typeof valor === "string" && Object.prototype.hasOwnProperty.call(ESTADOS_DILIGENCIA, valor);
}

export function normalizarEstado(valor: unknown): EstadoDiligencia {
  return esEstadoDiligencia(valor) ? valor : "PENDIENTE";
}

export type EventoProceso = {
  id: string;
  titulo: string;
  /** "YYYY-MM-DD" en hora de Perú. */
  fecha: string;
  /** "HH:MM" en hora de Perú, o null si el evento es de día completo. */
  hora: string | null;
  tipo_diligencia: string | null;
  responsable: string | null;
  responsable_id: string | null;
  estado: EstadoDiligencia;
  resultado: string | null;
  notificar: boolean;
  /** Días de anticipación con los que esta diligencia entra en los avisos. */
  dias_aviso: number;
  dias: number;
  nivel: NivelUrgencia;
  /** Pasó de fecha y nadie la cerró: sigue en rojo hasta que alguien decida. */
  vencidaSinCerrar: boolean;
};

/** Combina fecha ("YYYY-MM-DD") y hora ("HH:MM") de Perú en un timestamptz ISO. */
export function componerIniciaEn(fecha: string, hora?: string | null): string {
  const h = hora && /^\d{2}:\d{2}$/.test(hora) ? hora : "00:00";
  return `${fecha}T${h}:00${OFFSET_PERU}`;
}

/** De un timestamptz a { fecha, hora } en hora de Perú. */
export function descomponerIniciaEn(iso: string): { fecha: string; hora: string } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const val = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  const hora = val("hour") === "24" ? "00" : val("hour");
  return {
    fecha: `${val("year")}-${val("month")}-${val("day")}`,
    hora: `${hora}:${val("minute")}`,
  };
}

/** true si la parte horaria en Perú es 00:00 (se trató como día completo). */
function esDiaCompleto(iso: string): boolean {
  return descomponerIniciaEn(iso).hora === "00:00";
}

type EventoRow = {
  id: string;
  titulo: string | null;
  inicia_en: string | null;
  tipo_diligencia: string | null;
  responsable: string | null;
  responsable_id?: string | null;
  estado: string | null;
  resultado?: string | null;
  notificar: boolean | null;
  dias_aviso?: number | null;
};

/** Columnas que necesita `aEventoProceso`, para no repetirlas en cada consulta. */
export const COLUMNAS_EVENTO =
  "id, titulo, inicia_en, tipo_diligencia, responsable, responsable_id, estado, resultado, notificar, dias_aviso";

/** La fecha registrada tiene prioridad sobre fechas antiguas en la descripción. */
export function proximaDiligenciaRegistrada(proceso: { diligencia?: string | null; descripcion?: string | null }, eventos: EventoProceso[], hoy?: string): (NonNullable<ReturnType<typeof proximaDiligencia>> & { eventoId?: string }) | null {
  const pendiente = eventos.filter((e) => e.estado === "PENDIENTE").sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora ?? "").localeCompare(b.hora ?? ""))[0];
  if (pendiente) return { fechaISO: pendiente.fecha, hora: pendiente.hora ?? undefined, texto: pendiente.titulo, dias: diasHasta(pendiente.fecha, hoy), nivel: nivelUrgencia(diasHasta(pendiente.fecha, hoy)), eventoId: pendiente.id };
  // Una diligencia cerrada no debe reaparecer como pendiente por el texto legado.
  return eventos.length ? null : proximaDiligencia(proceso, hoy);
}

/** Lectura paginada en lote: una tabla no debe consultar eventos por cada fila. */
export async function cargarEventosPorProcesos(supabase: SupabaseClient, procesoIds: string[], hoy?: string): Promise<Record<string, EventoProceso[]>> {
  if (!procesoIds.length) return {};
  const resultados = await Promise.all([
    fetchAllRowsIn(procesoIds, (ids, from, to) => supabase.from("vinculos").select("origen_id, destino_id").eq("origen_tipo", "proceso").eq("destino_tipo", "evento").in("origen_id", ids).order("id").range(from, to)),
    fetchAllRowsIn(procesoIds, (ids, from, to) => supabase.from("vinculos").select("origen_id, destino_id").eq("origen_tipo", "evento").eq("destino_tipo", "proceso").in("destino_id", ids).order("id").range(from, to)),
  ]);
  for (const r of resultados) if (r.error) throw new Error(r.error.message);
  const pares = [...(resultados[0].data ?? []).map((v) => [v.origen_id, v.destino_id]), ...(resultados[1].data ?? []).map((v) => [v.destino_id, v.origen_id])] as [string, string][];
  const { data, error } = await fetchAllRowsIn([...new Set(pares.map(([, id]) => id))], (ids, from, to) => supabase.from("eventos").select(COLUMNAS_EVENTO).in("id", ids).order("inicia_en").order("id").range(from, to));
  if (error) throw new Error(error.message);
  const porId = new Map(((data ?? []) as EventoRow[]).map((row) => [row.id, aEventoProceso(row, hoy)]));
  const salida: Record<string, EventoProceso[]> = {};
  for (const [procesoId, eventoId] of pares) {
    const evento = porId.get(eventoId);
    if (evento && !(salida[procesoId] ?? []).some((e) => e.id === eventoId)) (salida[procesoId] ??= []).push(evento);
  }
  return salida;
}

export function aEventoProceso(row: EventoRow, hoy?: string): EventoProceso | null {
  if (!row.inicia_en) return null;
  const { fecha, hora } = descomponerIniciaEn(row.inicia_en);
  const dias = diasHasta(fecha, hoy);
  const estado = normalizarEstado(row.estado);
  return {
    id: row.id,
    titulo: row.titulo || row.tipo_diligencia || "Diligencia",
    fecha,
    hora: esDiaCompleto(row.inicia_en) ? null : hora,
    tipo_diligencia: row.tipo_diligencia,
    responsable: row.responsable,
    responsable_id: row.responsable_id ?? null,
    estado,
    resultado: row.resultado ?? null,
    notificar: row.notificar ?? true,
    dias_aviso: row.dias_aviso ?? 10,
    dias,
    nivel: nivelUrgencia(dias),
    vencidaSinCerrar: dias < 0 && estado === "PENDIENTE",
  };
}

/** Todas las diligencias registradas para un proceso, ordenadas por fecha. */
export async function cargarEventosDeProceso(
  supabase: SupabaseClient,
  procesoId: string,
  hoy?: string
): Promise<EventoProceso[]> {
  const { data: vinculos } = await supabase
    .from("vinculos")
    .select("origen_tipo, origen_id, destino_tipo, destino_id")
    .or(
      `and(origen_tipo.eq.proceso,origen_id.eq.${procesoId},destino_tipo.eq.evento),and(destino_tipo.eq.proceso,destino_id.eq.${procesoId},origen_tipo.eq.evento)`
    );

  const eventoIds = Array.from(
    new Set(
      (vinculos ?? []).map((v) =>
        v.origen_tipo === "evento" ? (v.origen_id as string) : (v.destino_id as string)
      )
    )
  );
  if (eventoIds.length === 0) return [];

  const { data: eventos } = await supabase
    .from("eventos")
    .select(COLUMNAS_EVENTO)
    .in("id", eventoIds)
    .order("inicia_en");

  return ((eventos ?? []) as EventoRow[])
    .map((row) => aEventoProceso(row, hoy))
    .filter((e): e is EventoProceso => e !== null);
}

export type ProcesoDeEvento = {
  id: string;
  expediente: string | null;
  materia: string | null;
  /** Sólo con `{ detalle: true }`: de qué trata el expediente ("Lavado de activos"…). */
  asunto?: string | null;
  juzgado?: string | null;
  /** Sólo con `{ detalle: true }`: partes con dato (Demandante, Imputado…) y los propietarios vinculados. */
  partes?: { label: string; valor: string }[];
};

/**
 * Expediente al que pertenece cada diligencia (`eventos.id` → proceso).
 *
 * Sin esto, abrir una audiencia desde el calendario o la campana no llevaba a
 * ninguna parte: el enlace apuntaba a `/dashboard`. El alta escribe el vínculo
 * como proceso→evento, pero se leen los dos sentidos porque la importación de
 * Notion dejó aristas en cualquier dirección.
 */
export async function cargarProcesosDeEventos(
  supabase: SupabaseClient,
  eventoIds: string[],
  /** `detalle`: también asunto, juzgado y partes (el popup del calendario los muestra; la campana no). */
  opciones: { detalle?: boolean } = {}
): Promise<Map<string, ProcesoDeEvento>> {
  const resultado = new Map<string, ProcesoDeEvento>();
  if (eventoIds.length === 0) return resultado;

  const [{ data: comoDestino }, { data: comoOrigen }] = await Promise.all([
    supabase
      .from("vinculos")
      .select("origen_id, destino_id")
      .eq("origen_tipo", "proceso")
      .eq("destino_tipo", "evento")
      .in("destino_id", eventoIds),
    supabase
      .from("vinculos")
      .select("origen_id, destino_id")
      .eq("origen_tipo", "evento")
      .eq("destino_tipo", "proceso")
      .in("origen_id", eventoIds),
  ]);

  const procesoIdPorEvento = new Map<string, string>();
  for (const v of comoDestino ?? []) procesoIdPorEvento.set(v.destino_id as string, v.origen_id as string);
  for (const v of comoOrigen ?? []) procesoIdPorEvento.set(v.origen_id as string, v.destino_id as string);
  if (procesoIdPorEvento.size === 0) return resultado;

  const procesoIds = Array.from(new Set(procesoIdPorEvento.values()));
  const [{ data: procesos }, propietariosPorProceso] = await Promise.all([
    fetchAllRowsIn(procesoIds, (lote, desde, hasta) => supabase
      .from("procesos")
      .select(opciones.detalle ? "id, expediente, materia, asunto, juzgado, extra" : "id, expediente, materia")
      .in("id", lote)
      .order("id")
      .range(desde, hasta)),
    opciones.detalle ? cargarPropietariosDeProcesos(supabase, procesoIds) : new Map<string, string[]>(),
  ]);

  type ProcesoFila = { id: string; expediente: string | null; materia: string | null; asunto?: string | null; juzgado?: string | null; extra?: unknown };
  const porId = new Map(((procesos ?? []) as unknown as ProcesoFila[]).map((p): [string, ProcesoDeEvento] => {
    if (!opciones.detalle) return [p.id, { id: p.id, expediente: p.expediente, materia: p.materia }];
    const partes = partesDeProceso(p.materia, p.extra)
      .filter((parte): parte is typeof parte & { valor: string } => parte.valor !== null)
      .map(({ label, valor }) => ({ label, valor }));
    const propietarios = propietariosPorProceso.get(p.id);
    if (propietarios?.length) partes.push({ label: "Propietarios", valor: propietarios.join("\n") });
    return [p.id, {
      id: p.id,
      expediente: p.expediente,
      materia: p.materia,
      asunto: p.asunto?.trim() || null,
      juzgado: p.juzgado?.trim() || null,
      partes,
    }];
  }));
  for (const [eventoId, procesoId] of procesoIdPorEvento) {
    const proceso = porId.get(procesoId);
    if (proceso) resultado.set(eventoId, proceso);
  }
  return resultado;
}

/** Nombres de los propietarios vinculados a cada proceso (en cualquier sentido del vínculo). */
async function cargarPropietariosDeProcesos(supabase: SupabaseClient, procesoIds: string[]): Promise<Map<string, string[]>> {
  const [{ data: comoOrigen }, { data: comoDestino }] = await Promise.all([
    fetchAllRowsIn(procesoIds, (lote, desde, hasta) => supabase
      .from("vinculos")
      .select("origen_id, destino_id")
      .eq("origen_tipo", "proceso")
      .eq("destino_tipo", "propietario")
      .in("origen_id", lote)
      .order("id")
      .range(desde, hasta)),
    fetchAllRowsIn(procesoIds, (lote, desde, hasta) => supabase
      .from("vinculos")
      .select("origen_id, destino_id")
      .eq("origen_tipo", "propietario")
      .eq("destino_tipo", "proceso")
      .in("destino_id", lote)
      .order("id")
      .range(desde, hasta)),
  ]);
  const idsPorProceso = new Map<string, Set<string>>();
  const registrar = (procesoId: string, propietarioId: string) => {
    const ids = idsPorProceso.get(procesoId) ?? new Set<string>();
    ids.add(propietarioId);
    idsPorProceso.set(procesoId, ids);
  };
  for (const v of (comoOrigen ?? []) as { origen_id: string; destino_id: string }[]) registrar(v.origen_id, v.destino_id);
  for (const v of (comoDestino ?? []) as { origen_id: string; destino_id: string }[]) registrar(v.destino_id, v.origen_id);

  const resultado = new Map<string, string[]>();
  const propietarioIds = Array.from(new Set(Array.from(idsPorProceso.values()).flatMap((ids) => Array.from(ids))));
  if (propietarioIds.length === 0) return resultado;
  const { data: propietarios } = await fetchAllRowsIn(propietarioIds, (lote, desde, hasta) => supabase
    .from("propietarios")
    .select("id, nombre")
    .in("id", lote)
    .order("id")
    .range(desde, hasta));
  const nombrePorId = new Map(((propietarios ?? []) as { id: string; nombre: string | null }[]).map((p) => [p.id, p.nombre?.trim() || null]));
  for (const [procesoId, ids] of idsPorProceso) {
    const nombres = Array.from(ids)
      .map((id) => nombrePorId.get(id))
      .filter((nombre): nombre is string => Boolean(nombre))
      .sort((a, b) => a.localeCompare(b, "es-PE"));
    if (nombres.length) resultado.set(procesoId, nombres);
  }
  return resultado;
}

/** Tipos de diligencia frecuentes, para el desplegable del alta. Texto libre igualmente. */
export const TIPOS_DILIGENCIA = [
  "Audiencia",
  "Audiencia preliminar",
  "Audiencia de juicio",
  "Vencimiento de plazo",
  "Vencimiento de subsanación",
  "Informe oral",
  "Notificación",
  "Inspección judicial",
  "Conciliación",
  "Lectura de sentencia",
  "Otro",
] as const;
