import { MATERIAS as MATERIA_LABEL, MATERIA_OPCIONES } from "@/app/(dashboard)/procesos/opciones";
import { TIPOS as TIPO_CONTRATO_LABEL } from "@/app/(dashboard)/contratos/opciones";
import { TIPOS as TIPO_DOCUMENTO_LABEL } from "@/app/(dashboard)/documentos/tipos";
// Parser de fechas en español dentro de `procesos.diligencia` (texto libre).
// Lo crea el paquete P4 (src/lib/procesos/diligencias.ts). Se asume que
// `extraerFechas(texto)` devuelve fechas ISO ("YYYY-MM-DD"); si el módulo
// aún no existe, este import falla en build hasta que P4 lo entregue.
import { extraerFechas } from "@/lib/procesos/diligencias";
import {
  ESTADOS_DILIGENCIA,
  aEventoProceso,
  descomponerIniciaEn,
  normalizarEstado,
  type EventoProceso,
  type ProcesoDeEvento,
} from "@/lib/procesos/eventos";
import { configDe, fuenteDocumento, fuentePropiedad, type MapaConfigFechas } from "@/lib/fechas-config";
import { sumarDiasISO } from "@/lib/utils";
import { alertaIdDeEvento, claveCierre, type CierreVencimiento } from "@/lib/vencimientos/cierres";

export { MATERIA_LABEL, MATERIA_OPCIONES };

// ─── Tipos ──────────────────────────────────────────────────────────────

export type CategoriaEvento = "contrato" | "vehiculo" | "personal" | "documento" | "proceso" | "evento";

/** Campo label/valor para el cuerpo del modal de detalle de un evento. */
export type DetalleCampo = { label: string; valor: string };

export type EventoCalendario = {
  id: string;
  /** "YYYY-MM-DD" en hora local (Perú) — nunca un timestamp UTC crudo. */
  fecha: string;
  titulo: string;
  subtitulo?: string;
  categoria: CategoriaEvento;
  /** Solo para categoria "proceso": alimenta el filtro de materia. */
  materia?: string;
  href: string;
  /** Campos adicionales para el modal (no son reuniones: son documentos/registros con fecha). */
  detalle?: DetalleCampo[];
  /** Fuente configurable en "Fechas y avisos"; sin fuente (diligencias) siempre se muestra. */
  fuente?: string;
  /** Solo categoría "evento": la diligencia tal cual, para verla y editarla sin salir del calendario. */
  diligencia?: DiligenciaCalendario;
  /** Enlace externo del registro (p. ej. la reunión de Meet de una declaración virtual). */
  enlace?: string;
  /**
   * Sólo fechas de tipo vencimiento: la alerta que representa, para poder
   * registrar qué pasó sin salir del calendario, y su cierre si ya lo tiene.
   */
  vencimiento?: { alertaId: string; cierre?: CierreVencimiento };
};

export type DiligenciaCalendario = EventoProceso & { procesoId: string | null };

/** Arma la lista de `detalle` descartando pares sin valor. */
function campos(...pares: Array<[string, string | number | null | undefined]>): DetalleCampo[] {
  const resultado: DetalleCampo[] = [];
  for (const [label, valor] of pares) {
    if (valor === null || valor === undefined) continue;
    const texto = String(valor).trim();
    if (!texto) continue;
    resultado.push({ label, valor: texto });
  }
  return resultado;
}

function formatoMonto(monto: number | null | undefined, moneda: string | null | undefined): string | null {
  if (monto === null || monto === undefined) return null;
  const simbolo = moneda === "USD" ? "US$" : "S/";
  return `${simbolo} ${monto.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatoFechaCorta(fechaISO: string | null | undefined): string | null {
  if (!fechaISO) return null;
  const fecha = fechaLocalDesdeISO(fechaISO);
  return fecha.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

export const CATEGORIA_META: Record<CategoriaEvento, { label: string; dot: string; text: string; chipActivo: string; barra: string }> = {
  contrato:  { label: "Contratos",  dot: "bg-brand-400",   text: "text-brand-300",   chipActivo: "border-brand-400/40 bg-brand-500/15 text-brand-200",     barra: "bg-brand-600/85 text-white" },
  vehiculo:  { label: "Vehículos",  dot: "bg-amber-400",   text: "text-amber-300",   chipActivo: "border-amber-400/40 bg-amber-500/15 text-amber-200",     barra: "bg-amber-600/85 text-white" },
  personal:  { label: "Personal",   dot: "bg-emerald-400", text: "text-emerald-300", chipActivo: "border-emerald-400/40 bg-emerald-500/15 text-emerald-200", barra: "bg-emerald-600/85 text-white" },
  documento: { label: "Documentos", dot: "bg-violet-400",  text: "text-violet-300",  chipActivo: "border-violet-400/40 bg-violet-500/15 text-violet-200",   barra: "bg-violet-600/85 text-white" },
  proceso:   { label: "Procesos",   dot: "bg-red-400",     text: "text-red-300",     chipActivo: "border-red-400/40 bg-red-500/15 text-red-200",           barra: "bg-red-600/85 text-white" },
  evento:    { label: "Eventos",    dot: "bg-pink-400",    text: "text-pink-300",    chipActivo: "border-pink-400/40 bg-pink-500/15 text-pink-200",         barra: "bg-pink-600/85 text-white" },
};

export const CATEGORIAS: CategoriaEvento[] = ["contrato", "vehiculo", "personal", "documento", "proceso", "evento"];

export const DIAS_SEMANA = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
export const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// ─── Fechas locales (sin librerías, con cuidado del huso horario) ────────

/** Parsea "YYYY-MM-DD" como fecha LOCAL (no UTC) para que no se desplace un día. */
export function fechaLocalDesdeISO(fechaISO: string): Date {
  const [anio, mes, dia] = fechaISO.split("-").map(Number);
  return new Date(anio, (mes || 1) - 1, dia || 1);
}

/** Clave "YYYY-MM-DD" de una fecha local — usada para agrupar/comparar días. */
export function claveDia(fecha: Date): string {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Convierte un timestamptz (p.ej. `eventos.inicia_en`) a su clave de día en hora de Perú. */
export function claveDiaEnLima(fechaHoraISO: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(fechaHoraISO));
}

/** "Hoy" según la hora de Perú, como fecha local — no depende del huso del navegador. */
export function hoyEnLima(): Date {
  return fechaLocalDesdeISO(claveDiaEnLima(new Date().toISOString()));
}

export function esMismoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** 42 días (6 semanas, lunes a domingo) que cubren el mes `mes` (0-11) del año `anio`. */
export function generarGrillaMes(anio: number, mes: number): Date[] {
  const primerDia = new Date(anio, mes, 1);
  const offset = (primerDia.getDay() + 6) % 7; // getDay(): 0=domingo → 0=lunes
  const inicio = new Date(anio, mes, 1 - offset);
  return Array.from({ length: 42 }, (_, i) => new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i));
}

// ─── Agrupación ───────────────────────────────────────────────────────────

export function agruparPorDia(eventos: EventoCalendario[]): Map<string, EventoCalendario[]> {
  const mapa = new Map<string, EventoCalendario[]>();
  for (const ev of eventos) {
    const lista = mapa.get(ev.fecha);
    if (lista) lista.push(ev);
    else mapa.set(ev.fecha, [ev]);
  }
  return mapa;
}

/** Eventos entre hoy (Lima) y `dias` días después, ordenados por fecha — para la vista agenda. */
export function proximosDias(eventos: EventoCalendario[], dias: number): EventoCalendario[] {
  const hoy = hoyEnLima();
  const limite = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + dias);
  return eventos
    .filter((e) => {
      const f = fechaLocalDesdeISO(e.fecha);
      return f >= hoy && f <= limite;
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// ─── Normalización: filas de Supabase → EventoCalendario[] ───────────────
// Cada fuente se consulta una sola vez (en el server component) y se
// normaliza aquí; nada de consultas por fila.

type ContratoFechaRow = {
  id: string;
  tipo: string | null;
  nombre: string | null;
  fecha_inicio: string | null;
  fecha_vencimiento: string | null;
  monto: number | null;
  moneda: string | null;
  estado: string | null;
};

export function normalizarContratos(rows: ContratoFechaRow[]): EventoCalendario[] {
  const eventos: EventoCalendario[] = [];
  for (const r of rows) {
    const titulo = r.nombre || "Contrato";
    const tipoLabel = (r.tipo && TIPO_CONTRATO_LABEL[r.tipo]) || r.tipo || undefined;
    const montoTexto = formatoMonto(r.monto, r.moneda);
    if (r.fecha_inicio) {
      eventos.push({
        id: `contrato-inicio-${r.id}`,
        fecha: r.fecha_inicio,
        titulo,
        subtitulo: tipoLabel ? `${tipoLabel} · inicio` : "Inicio de contrato",
        categoria: "contrato",
        fuente: "contrato.fecha_inicio",
        href: `/contratos/${r.id}`,
        detalle: campos(
          ["Tipo", tipoLabel],
          ["Estado", r.estado],
          ["Monto", montoTexto],
          ["Vencimiento", formatoFechaCorta(r.fecha_vencimiento)]
        ),
      });
    }
    if (r.fecha_vencimiento) {
      eventos.push({
        id: `contrato-vence-${r.id}`,
        fecha: r.fecha_vencimiento,
        titulo,
        subtitulo: tipoLabel ? `${tipoLabel} · vencimiento` : "Vencimiento de contrato",
        categoria: "contrato",
        fuente: "contrato.fecha_vencimiento",
        href: `/contratos/${r.id}`,
        detalle: campos(
          ["Tipo", tipoLabel],
          ["Estado", r.estado],
          ["Monto", montoTexto],
          ["Inicio", formatoFechaCorta(r.fecha_inicio)]
        ),
      });
    }
  }
  return eventos;
}

type VehiculoFechaRow = {
  id: string;
  placa: string | null;
  marca_modelo: string | null;
  soat_vence: string | null;
  poliza_vence: string | null;
  revision_tecnica: string | null;
  responsable: string | null;
};

export function normalizarVehiculos(rows: VehiculoFechaRow[]): EventoCalendario[] {
  const eventos: EventoCalendario[] = [];
  for (const r of rows) {
    const titulo = r.placa || r.marca_modelo || "Vehículo";
    if (r.soat_vence) {
      eventos.push({
        id: `vehiculo-soat-${r.id}`,
        fecha: r.soat_vence,
        titulo,
        subtitulo: "Vencimiento SOAT",
        categoria: "vehiculo",
        fuente: "vehiculo.soat_vence",
        href: `/entidades/vehiculos/${r.id}`,
        detalle: campos(
          ["Marca / Modelo", r.marca_modelo],
          ["Responsable", r.responsable],
          ["Vencimiento de póliza", formatoFechaCorta(r.poliza_vence)],
          ["Revisión técnica", formatoFechaCorta(r.revision_tecnica)]
        ),
      });
    }
    if (r.poliza_vence) {
      eventos.push({
        id: `vehiculo-poliza-${r.id}`,
        fecha: r.poliza_vence,
        titulo,
        subtitulo: "Vencimiento de póliza",
        categoria: "vehiculo",
        fuente: "vehiculo.poliza_vence",
        href: `/entidades/vehiculos/${r.id}`,
        detalle: campos(
          ["Marca / Modelo", r.marca_modelo],
          ["Responsable", r.responsable],
          ["Vencimiento SOAT", formatoFechaCorta(r.soat_vence)],
          ["Revisión técnica", formatoFechaCorta(r.revision_tecnica)]
        ),
      });
    }
    if (r.revision_tecnica) {
      eventos.push({
        id: `vehiculo-revision-tecnica-${r.id}`,
        fecha: r.revision_tecnica,
        titulo,
        subtitulo: "Vencimiento de revisión técnica",
        categoria: "vehiculo",
        fuente: "vehiculo.revision_tecnica",
        href: `/entidades/vehiculos/${r.id}`,
        detalle: campos(
          ["Marca / Modelo", r.marca_modelo],
          ["Responsable", r.responsable],
          ["Vencimiento SOAT", formatoFechaCorta(r.soat_vence)],
          ["Vencimiento de póliza", formatoFechaCorta(r.poliza_vence)]
        ),
      });
    }
  }
  return eventos;
}

type PersonalFechaRow = {
  id: string;
  nombre: string | null;
  contrato_inicio: string | null;
  contrato_fin: string | null;
  cargo: string | null;
};

export function normalizarPersonal(rows: PersonalFechaRow[]): EventoCalendario[] {
  const eventos: EventoCalendario[] = [];
  for (const r of rows) {
    const titulo = r.nombre || "Personal";
    if (r.contrato_inicio) {
      eventos.push({
        id: `personal-inicio-${r.id}`,
        fecha: r.contrato_inicio,
        titulo,
        subtitulo: "Inicio de contrato",
        categoria: "personal",
        fuente: "personal.contrato_inicio",
        href: `/entidades/personal/${r.id}`,
        detalle: campos(["Cargo", r.cargo], ["Fin de contrato", formatoFechaCorta(r.contrato_fin)]),
      });
    }
    if (r.contrato_fin) {
      eventos.push({
        id: `personal-fin-${r.id}`,
        fecha: r.contrato_fin,
        titulo,
        subtitulo: "Fin de contrato",
        categoria: "personal",
        fuente: "personal.contrato_fin",
        href: `/entidades/personal/${r.id}`,
        detalle: campos(["Cargo", r.cargo], ["Inicio de contrato", formatoFechaCorta(r.contrato_inicio)]),
      });
    }
  }
  return eventos;
}

type DocumentoFechaRow = {
  id: string;
  nombre: string | null;
  tipo: string | null;
  fecha: string | null;
  detalle: string | null;
};

export function normalizarDocumentos(rows: DocumentoFechaRow[]): EventoCalendario[] {
  return rows
    .filter((r): r is DocumentoFechaRow & { fecha: string } => !!r.fecha)
    .map((r) => {
      const tipoLabel = (r.tipo && TIPO_DOCUMENTO_LABEL[r.tipo]) || r.tipo || undefined;
      return {
        id: `documento-${r.id}`,
        fecha: r.fecha,
        titulo: r.nombre || "Documento",
        subtitulo: tipoLabel,
        categoria: "documento" as const,
        href: `/documentos/${r.id}`,
        detalle: campos(["Tipo", tipoLabel], ["Detalle", r.detalle]),
        fuente: r.tipo ? fuenteDocumento(r.tipo) : undefined,
      };
    });
}

type EventoRow = {
  id: string;
  titulo: string | null;
  inicia_en: string | null;
  tipo_diligencia: string | null;
  responsable: string | null;
  estado: string | null;
  responsable_id?: string | null;
  resultado?: string | null;
  notificar?: boolean | null;
  dias_aviso?: number | null;
  extra?: unknown;
};

/** Expediente al que pertenece cada diligencia — lo resuelve `cargarProcesosDeEventos`. */
export type { ProcesoDeEvento };

/**
 * Sólo http(s): el valor viene de texto libre importado de Notion y termina en
 * un `href`. "meet.google.com/abc" (sin protocolo) se completa con https.
 */
export function enlaceExterno(valor: unknown): string | undefined {
  if (typeof valor !== "string") return undefined;
  const texto = valor.trim();
  if (!texto) return undefined;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(texto) ? texto : `https://${texto}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function textoDeExtra(extra: unknown, clave: string): string | null {
  if (!extra || typeof extra !== "object") return null;
  const valor = (extra as Record<string, unknown>)[clave];
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

/**
 * "2026-08-24T15:30:00Z" → "10:30 a. m." en hora de Perú. Las 00:00 son el
 * marcador de "sin hora" (`componerIniciaEn`), no una cita a medianoche.
 */
function formatoHoraLima(fechaHoraISO: string): string | null {
  if (descomponerIniciaEn(fechaHoraISO).hora === "00:00") return null;
  const texto = new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(fechaHoraISO));
  return texto;
}

/**
 * `procesoPorEvento` enlaza cada diligencia con su expediente. Sin él el
 * evento apuntaba a `/dashboard`: pulsar una audiencia en el calendario no
 * llevaba a ninguna parte.
 */
export function normalizarEventos(
  rows: EventoRow[],
  procesoPorEvento?: ReadonlyMap<string, ProcesoDeEvento>
): EventoCalendario[] {
  return rows
    .filter((r): r is EventoRow & { inicia_en: string } => !!r.inicia_en)
    .map((r) => {
      const proceso = procesoPorEvento?.get(r.id);
      const materiaLabel = proceso?.materia ? MATERIA_LABEL[proceso.materia] : undefined;
      const nombre = r.titulo || "Evento";
      // El cliente ubica cada diligencia por su expediente ("Seguimiento
      // título" solo no dice de qué trámite es): va primero, también en el
      // chip del calendario. Sin proceso, el título queda como está.
      const expediente = proceso?.expediente?.trim();
      const titulo = expediente && !nombre.includes(expediente) ? `Exp. ${expediente} · ${nombre}` : nombre;
      return {
        id: `evento-${r.id}`,
        fecha: claveDiaEnLima(r.inicia_en),
        titulo,
        subtitulo: expediente ? undefined : r.tipo_diligencia ?? undefined,
        categoria: "evento" as const,
        materia: proceso?.materia ?? undefined,
        href: proceso ? `/procesos/${proceso.id}` : "/dashboard",
        detalle: campos(
          ["Hora", formatoHoraLima(r.inicia_en)],
          ["Tipo de diligencia", r.tipo_diligencia],
          ["Expediente", proceso?.expediente],
          ["Asunto", proceso?.asunto],
          ["Materia", materiaLabel],
          ["Juzgado", proceso?.juzgado],
          ...(proceso?.partes ?? []).map((parte): [string, string] => [parte.label, parte.valor]),
          ["Responsable", r.responsable],
          ["Estado", r.estado ? ESTADOS_DILIGENCIA[normalizarEstado(r.estado)] : null],
          ["Resultado", r.resultado],
          ["Detalle", textoDeExtra(r.extra, "Info")]
        ),
        enlace: enlaceExterno(textoDeExtra(r.extra, "URL")),
        diligencia: diligenciaCalendario(r, proceso?.id ?? null),
      };
    });
}

function diligenciaCalendario(r: EventoRow & { inicia_en: string }, procesoId: string | null): DiligenciaCalendario | undefined {
  const evento = aEventoProceso({
    ...r,
    notificar: r.notificar ?? null,
  });
  return evento ? { ...evento, procesoId } : undefined;
}

type ProcesoDiligenciaRow = {
  id: string;
  materia: string | null;
  expediente: string | null;
  asunto: string | null;
  diligencia: string | null;
  estado: string | null;
  juzgado: string | null;
  abogado: string | null;
};

/**
 * Fechas detectadas con regex en el texto libre del expediente.
 *
 * Son una *pista*, no una diligencia: el texto menciona tanto la audiencia que
 * viene como la fecha en que se presentó la demanda hace cuatro años, y el
 * parser no distingue una de otra. Por eso se descarta todo lo anterior a hoy
 * (un hecho pasado no es una cita) y todo lo que ya tenga una diligencia real
 * registrada ese día en ese proceso, que antes salía dos veces en el mismo
 * casillero.
 *
 * `registradas` trae claves "procesoId|YYYY-MM-DD".
 */
export function normalizarDiligenciasProcesos(
  rows: ProcesoDiligenciaRow[],
  opciones: { registradas?: ReadonlySet<string>; desde?: string } = {}
): EventoCalendario[] {
  const desde = opciones.desde ?? claveDiaEnLima(new Date().toISOString());
  const eventos: EventoCalendario[] = [];
  for (const r of rows) {
    if (!r.diligencia) continue;
    const materiaLabel = r.materia ? MATERIA_LABEL[r.materia] : undefined;
    for (const fecha of extraerFechas(r.diligencia)) {
      if (fecha < desde) continue;
      if (opciones.registradas?.has(`${r.id}|${fecha}`)) continue;
      eventos.push({
        id: `proceso-${r.id}-${fecha}`,
        fecha,
        titulo: r.asunto || r.expediente || "Diligencia",
        subtitulo: r.expediente ? `Exp. ${r.expediente} · detectada` : `${materiaLabel ?? "Proceso"} · detectada`,
        categoria: "proceso",
        materia: r.materia ?? undefined,
        href: `/procesos/${r.id}`,
        detalle: campos(
          ["Expediente", r.expediente],
          ["Materia", materiaLabel],
          ["Estado", r.estado],
          ["Juzgado", r.juzgado],
          ["Abogado", r.abogado],
          ["Origen", "Fecha detectada en el texto del expediente — regístrala para darle seguimiento"]
        ),
      });
    }
  }
  return eventos;
}

/**
 * Fila ya resuelta de una propiedad personalizada de tipo "fecha": la arma
 * `cargarFechasPersonalizadas` (calendario-server.ts), que es quien conoce
 * las tablas de cada entidad. Aquí sólo se le da forma de evento.
 */
export type PropiedadFechaRow = {
  /** id de la definición de la propiedad — parte de la clave del evento. */
  propiedadId: string;
  /** Nombre que el usuario le puso a la propiedad ("Audiencia", "Lenin"…). */
  propiedadNombre: string;
  entidadId: string;
  /** Etiqueta singular de la entidad ("Proceso", "Contrato"…). */
  entidadLabel: string;
  /** Nombre del registro dueño de la fecha (expediente, placa, nombre…). */
  entidadNombre: string;
  href: string;
  /** "YYYY-MM-DD". */
  fecha: string;
};

/** Título: el registro; subtítulo: el nombre de la propiedad. */
export function normalizarPropiedadesFecha(rows: PropiedadFechaRow[]): EventoCalendario[] {
  return rows.map((r) => ({
    id: `propiedad-${r.propiedadId}-${r.entidadId}`,
    fecha: r.fecha,
    titulo: r.entidadNombre || r.entidadLabel,
    subtitulo: r.propiedadNombre,
    categoria: "evento" as const,
    href: r.href,
    detalle: campos(
      ["Propiedad", r.propiedadNombre],
      [r.entidadLabel, r.entidadNombre],
      ["Fecha", formatoFechaCorta(r.fecha)]
    ),
    fuente: fuentePropiedad(r.propiedadId),
  }));
}

/**
 * Aplica "Fechas y avisos": lo marcado como dato sale del calendario, y un
 * vencimiento con días de vigencia se muestra el día en que vence, no el de
 * emisión.
 */
export function aplicarConfigFechas(eventos: EventoCalendario[], config: MapaConfigFechas): EventoCalendario[] {
  const resultado: EventoCalendario[] = [];
  for (const evento of eventos) {
    if (!evento.fuente) {
      resultado.push(evento);
      continue;
    }
    const { tipo, diasVigencia } = configDe(config, evento.fuente);
    if (tipo === "dato") continue;
    if (tipo === "vencimiento") {
      // Misma alerta que arma `alertas.ts`: cerrarla aquí la saca del dashboard,
      // la campana y el correo.
      const alertaId = alertaIdDeEvento(evento.fuente, evento.id);
      const base = alertaId ? { ...evento, vencimiento: { alertaId } } : evento;
      resultado.push(
        diasVigencia
          ? {
              ...base,
              fecha: sumarDiasISO(evento.fecha, diasVigencia),
              subtitulo: evento.subtitulo ? `${evento.subtitulo} · vence` : "Vence",
              detalle: [...(evento.detalle ?? []), { label: "Emitido", valor: formatoFechaCorta(evento.fecha) ?? evento.fecha }],
            }
          : base
      );
      continue;
    }
    resultado.push(evento);
  }
  return resultado;
}

/**
 * Qué muestra el calendario para "registrar qué pasó" con un evento:
 * vencimientos (contrato, SOAT…) y diligencias —con o sin expediente— se
 * cierran sin salir del dashboard.
 *
 * - `cerrado`: ya se registró (vencimiento con cierre o diligencia no pendiente).
 * - `editable`: el rol puede cerrarlo o reabrirlo.
 * - `cerrable`: editable y todavía abierto.
 * - `vencidoSinCerrar`: pasó de fecha y sigue abierto (el botón va en rojo).
 */
export function estadoCierreEvento(
  evento: EventoCalendario,
  opciones: { vencimientosEditables: readonly string[]; puedeCerrarDiligencias: boolean; hoy: string }
): { cerrado: boolean; editable: boolean; cerrable: boolean; vencidoSinCerrar: boolean } {
  const { diligencia, vencimiento } = evento;
  if (diligencia) {
    const pendiente = diligencia.estado === "PENDIENTE";
    return {
      cerrado: !pendiente,
      editable: opciones.puedeCerrarDiligencias,
      cerrable: opciones.puedeCerrarDiligencias && pendiente,
      vencidoSinCerrar: diligencia.vencidaSinCerrar,
    };
  }
  if (!vencimiento) return { cerrado: false, editable: false, cerrable: false, vencidoSinCerrar: false };
  const cerrado = !!vencimiento.cierre;
  // Las fechas de propiedades personalizadas ("evento") pueden ser de cualquier
  // entidad: el servidor decide al guardar.
  const editable = evento.categoria === "evento" || opciones.vencimientosEditables.includes(evento.categoria);
  return { cerrado, editable, cerrable: editable && !cerrado, vencidoSinCerrar: !cerrado && evento.fecha < opciones.hoy };
}

/** Adjunta a cada vencimiento del calendario su cierre, si lo tiene. */
export function adjuntarCierres(
  eventos: EventoCalendario[],
  cierres: ReadonlyMap<string, CierreVencimiento>
): EventoCalendario[] {
  if (cierres.size === 0) return eventos;
  return eventos.map((evento) => {
    if (!evento.vencimiento) return evento;
    const cierre = cierres.get(claveCierre(evento.vencimiento.alertaId, evento.fecha));
    return cierre ? { ...evento, vencimiento: { ...evento.vencimiento, cierre } } : evento;
  });
}
